from datetime import datetime
import json
import logging
import re
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple
from pathlib import Path

from src.config import Config, setup_env
from src.core.config_backend import get_config_backend
from src.core.config_manager import ConfigManager
from src.core.config_registry import (
    build_schema_response,
    get_category_definitions,
    get_field_definition,
    get_registered_field_keys,
)

logger = logging.getLogger(__name__)


class ConfigValidationError(Exception):
    """Raised when one or more submitted fields fail validation."""

    def __init__(self, issues: List[Dict[str, Any]]):
        super().__init__("Configuration validation failed")
        self.issues = issues


class ConfigConflictError(Exception):
    """Raised when submitted config_version is stale."""

    def __init__(self, current_version: str):
        super().__init__("Configuration version conflict")
        self.current_version = current_version


class SystemConfigService:
    """Service layer for reading, validating, and updating runtime configuration."""

    def __init__(self, manager: Optional[Any] = None):
        # 使用 pluggable 后端
        self._backend = manager if manager else get_config_backend()

    def get_schema(self) -> Dict[str, Any]:
        """Return grouped schema metadata for UI rendering."""
        return build_schema_response()

    def get_config(self, include_schema: bool = True, mask_token: str = "******") -> Dict[str, Any]:
        """Return current config values without server-side secret masking."""
        config_map = self._backend.read_config_map()
        registered_keys = set(get_registered_field_keys())
        all_keys = set(config_map.keys()) | registered_keys

        category_orders = {
            item["category"]: item["display_order"]
            for item in get_category_definitions()
        }

        schema_by_key: Dict[str, Dict[str, Any]] = {
            key: get_field_definition(key, config_map.get(key, ""))
            for key in all_keys
        }

        items: List[Dict[str, Any]] = []
        for key in all_keys:
            raw_value = config_map.get(key, "")

            # [UX Improvement] Pre-fill default prompt if empty
            if key == "SYSTEM_PROMPT_TEMPLATE" and not raw_value:
                try:
                    # Dynamically locate default prompt file relative to this service file
                    # File path: src/services/system_config_service.py -> src/prompts/default_prompt.md
                    prompt_path = Path(__file__).parent.parent / "prompts" / "default_prompt.md"
                    if prompt_path.exists():
                        raw_value = prompt_path.read_text(encoding="utf-8")
                except Exception:
                    # Fail silently on read error, preserving empty value
                    pass

            field_schema = schema_by_key[key]
            item: Dict[str, Any] = {
                "key": key,
                "value": raw_value,
                "raw_value_exists": bool(raw_value),
                "is_masked": False,
            }
            if include_schema:
                item["schema"] = field_schema
            items.append(item)

        items.sort(
            key=lambda item: (
                category_orders.get(schema_by_key[item["key"]].get("category", "uncategorized"), 999),
                schema_by_key[item["key"]].get("display_order", 9999),
                item["key"],
            )
        )

        return {
            "config_version": self._backend.get_config_version(),
            "mask_token": mask_token,
            "items": items,
            "updated_at": self._backend.get_updated_at(),
        }

    def validate(self, items: Sequence[Dict[str, str]], mask_token: str = "******") -> Dict[str, Any]:
        """Validate submitted items without writing to backend."""
        issues = self._collect_issues(items=items, mask_token=mask_token)
        valid = not any(issue["severity"] == "error" for issue in issues)
        return {
            "valid": valid,
            "issues": issues,
        }

    def update(
        self,
        config_version: str,
        items: Sequence[Dict[str, str]],
        mask_token: str = "******",
        reload_now: bool = True,
    ) -> Dict[str, Any]:
        """Validate and persist updates into backend, then reload runtime config."""
        current_version = self._backend.get_config_version()
        if current_version != config_version:
            raise ConfigConflictError(current_version=current_version)

        issues = self._collect_issues(items=items, mask_token=mask_token)
        errors = [issue for issue in issues if issue["severity"] == "error"]
        if errors:
            raise ConfigValidationError(issues=errors)

        updates: List[Tuple[str, str]] = []
        sensitive_keys: Set[str] = set()
        for item in items:
            key = item["key"].upper()
            value = item["value"]
            updates.append((key, value))
            field_schema = get_field_definition(key)
            if bool(field_schema.get("is_sensitive", False)):
                sensitive_keys.add(key)

        updated_keys, skipped_masked_keys, new_version = self._backend.apply_updates(
            updates=updates,
            sensitive_keys=sensitive_keys,
            mask_token=mask_token,
        )

        warnings: List[str] = []
        reload_triggered = False
        if reload_now:
            try:
                Config.reset_instance()
                setup_env(override=True)
                config = Config.get_instance()
                warnings = config.validate()
                reload_triggered = True
            except Exception as exc:  # pragma: no cover - defensive branch
                logger.error("Configuration reload failed: %s", exc, exc_info=True)
                warnings.append("Configuration updated but reload failed")

        return {
            "success": True,
            "config_version": new_version,
            "applied_count": len(updated_keys),
            "skipped_masked_count": len(skipped_masked_keys),
            "reload_triggered": reload_triggered,
            "updated_keys": updated_keys,
            "warnings": warnings,
        }

    @staticmethod
    def _build_model_urls(base_url: Optional[str]) -> List[str]:
        """Build candidate model-list URLs for OpenAI-compatible providers."""
        if not base_url:
            return ["https://api.openai.com/v1/models"]

        normalized = base_url.strip()
        if not normalized:
            return ["https://api.openai.com/v1/models"]

        if not normalized.startswith(("http://", "https://")):
            normalized = f"https://{normalized}"

        normalized = normalized.rstrip("/")

        # Common patterns
        if normalized.endswith("/v1/models") or normalized.endswith("/models"):
            return [normalized]

        if normalized.endswith("/v1"):
            return [f"{normalized}/models", f"{normalized[:-3]}/models"]

        # Try both /v1/models and /models for compatibility with different gateways
        return [f"{normalized}/v1/models", f"{normalized}/models"]

    @staticmethod
    def fetch_openai_models(api_key: str, base_url: Optional[str] = None) -> List[str]:
        """Fetch available models from an OpenAI-compatible provider."""
        import httpx

        if not api_key or api_key.startswith("your_"):
            return []

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        }

        candidate_urls = SystemConfigService._build_model_urls(base_url)
        last_error: Optional[Exception] = None

        for url in candidate_urls:
            for trust_env in (True, False):
                logger.info("Fetching models from %s (trust_env=%s)", url, trust_env)
                try:
                    with httpx.Client(
                        timeout=httpx.Timeout(15.0, connect=10.0),
                        follow_redirects=True,
                        trust_env=trust_env,
                        http2=False,
                    ) as client:
                        response = client.get(url, headers=headers)

                    if response.status_code == 401:
                        raise RuntimeError("Authentication failed: invalid API key")
                    if response.status_code == 403:
                        raise RuntimeError("Access denied by provider (403)")
                    if response.status_code == 404:
                        # try next candidate URL
                        continue

                    response.raise_for_status()
                    data = response.json()

                    # OpenAI format: {"data": [{"id": "model-1"}, ...]}
                    if isinstance(data, dict) and "data" in data:
                        models = [m["id"] for m in data["data"] if isinstance(m, dict) and "id" in m]
                        return sorted(models)

                    return []

                except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout) as exc:
                    last_error = exc
                    logger.warning("Model fetch network error at %s (trust_env=%s): %s", url, trust_env, exc)
                except Exception as exc:
                    last_error = exc
                    logger.warning("Model fetch failed at %s (trust_env=%s): %s", url, trust_env, exc)

        error_text = str(last_error) if last_error else "unknown error"
        raise RuntimeError(
            "Fetch models failed. Please verify BASE_URL/API_KEY, proxy settings, and TLS certificates. "
            f"Last error: {error_text}"
        )

    def _collect_issues(self, items: Sequence[Dict[str, str]], mask_token: str) -> List[Dict[str, Any]]:
        """Collect field-level and cross-field validation issues."""
        current_map = self._backend.read_config_map()
        effective_map = dict(current_map)
        issues: List[Dict[str, Any]] = []
        updated_map: Dict[str, str] = {}

        for item in items:
            key = item["key"].upper()
            value = item["value"]
            field_schema = get_field_definition(key, value)
            is_sensitive = bool(field_schema.get("is_sensitive", False))

            if is_sensitive and value == mask_token and current_map.get(key):
                continue

            updated_map[key] = value
            effective_map[key] = value
            issues.extend(self._validate_value(key=key, value=value, field_schema=field_schema))

        issues.extend(self._validate_cross_field(effective_map=effective_map, updated_keys=set(updated_map.keys())))
        return issues

    @staticmethod
    def _validate_value(key: str, value: str, field_schema: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Validate a single field value against schema metadata."""
        issues: List[Dict[str, Any]] = []
        data_type = field_schema.get("data_type", "string")
        validation = field_schema.get("validation", {}) or {}
        is_required = field_schema.get("is_required", False)

        # Empty values are valid for non-required fields (skip type validation)
        if not value.strip() and not is_required:
            return issues

        if "\n" in value:
            issues.append(
                {
                    "key": key,
                    "code": "invalid_value",
                    "message": "Value cannot contain newline characters",
                    "severity": "error",
                    "expected": "single-line value",
                    "actual": "contains newline",
                }
            )
            return issues

        if data_type == "integer":
            try:
                numeric = int(value)
            except ValueError:
                return [
                    {
                        "key": key,
                        "code": "invalid_type",
                        "message": "Value must be an integer",
                        "severity": "error",
                        "expected": "integer",
                        "actual": value,
                    }
                ]
            issues.extend(SystemConfigService._validate_numeric_range(key, numeric, validation))

        elif data_type == "number":
            try:
                numeric = float(value)
            except ValueError:
                return [
                    {
                        "key": key,
                        "code": "invalid_type",
                        "message": "Value must be a number",
                        "severity": "error",
                        "expected": "number",
                        "actual": value,
                    }
                ]
            issues.extend(SystemConfigService._validate_numeric_range(key, numeric, validation))

        elif data_type == "boolean":
            if value.strip().lower() not in {"true", "false"}:
                issues.append(
                    {
                        "key": key,
                        "code": "invalid_type",
                        "message": "Value must be true or false",
                        "severity": "error",
                        "expected": "true|false",
                        "actual": value,
                    }
                )

        elif data_type == "time":
            pattern = validation.get("pattern") or r"^([01]\d|2[0-3]):[0-5]\d$"
            if not re.match(pattern, value.strip()):
                issues.append(
                    {
                        "key": key,
                        "code": "invalid_format",
                        "message": "Value must be in HH:MM format",
                        "severity": "error",
                        "expected": "HH:MM",
                        "actual": value,
                    }
                )

        if "enum" in validation and value and value not in validation["enum"]:
            issues.append(
                {
                    "key": key,
                    "code": "invalid_enum",
                    "message": "Value is not in allowed options",
                    "severity": "error",
                    "expected": ",".join(validation["enum"]),
                    "actual": value,
                }
            )

        return issues

    @staticmethod
    def _validate_numeric_range(key: str, numeric_value: float, validation: Dict[str, Any]) -> List[Dict[str, Any]]:
        issues: List[Dict[str, Any]] = []
        min_value = validation.get("min")
        max_value = validation.get("max")

        if min_value is not None and numeric_value < min_value:
            issues.append(
                {
                    "key": key,
                    "code": "out_of_range",
                    "message": "Value is lower than minimum",
                    "severity": "error",
                    "expected": f">={min_value}",
                    "actual": str(numeric_value),
                }
            )
        if max_value is not None and numeric_value > max_value:
            issues.append(
                {
                    "key": key,
                    "code": "out_of_range",
                    "message": "Value is greater than maximum",
                    "severity": "error",
                    "expected": f"<={max_value}",
                    "actual": str(numeric_value),
                }
            )
        return issues

    @staticmethod
    def _validate_extra_ai_models(extra_models_raw: str) -> List[Dict[str, Any]]:
        issues: List[Dict[str, Any]] = []

        value = (extra_models_raw or "").strip()
        if not value:
            return issues

        try:
            parsed = json.loads(value)
        except Exception as exc:
            return [
                {
                    "key": "EXTRA_AI_MODELS",
                    "code": "invalid_json",
                    "message": "EXTRA_AI_MODELS must be valid JSON array",
                    "severity": "error",
                    "expected": "JSON array",
                    "actual": str(exc),
                }
            ]

        if not isinstance(parsed, list):
            return [
                {
                    "key": "EXTRA_AI_MODELS",
                    "code": "invalid_type",
                    "message": "EXTRA_AI_MODELS must be a JSON array",
                    "severity": "error",
                    "expected": "array",
                    "actual": type(parsed).__name__,
                }
            ]

        for idx, item in enumerate(parsed):
            item_key = f"EXTRA_AI_MODELS[{idx}]"
            if not isinstance(item, dict):
                issues.append(
                    {
                        "key": item_key,
                        "code": "invalid_type",
                        "message": "Each model item must be an object",
                        "severity": "error",
                        "expected": "object",
                        "actual": type(item).__name__,
                    }
                )
                continue

            provider = (item.get("provider") or "").strip()
            model = (item.get("model") or item.get("model_name") or "").strip()
            name = (item.get("name") or "").strip()

            if not provider:
                issues.append(
                    {
                        "key": item_key,
                        "code": "missing_field",
                        "message": "provider is required",
                        "severity": "error",
                        "expected": "non-empty provider",
                        "actual": provider,
                    }
                )

            if not model:
                issues.append(
                    {
                        "key": item_key,
                        "code": "missing_field",
                        "message": "model is required",
                        "severity": "error",
                        "expected": "non-empty model",
                        "actual": model,
                    }
                )

            if not name and not model:
                base_url_hint = (item.get("base_url") or "").strip()
                if not base_url_hint:
                    issues.append(
                        {
                            "key": item_key,
                            "code": "auto_name_fallback",
                            "message": "name is empty and base_url/model are missing; default provider name will be used",
                            "severity": "warning",
                            "expected": "name or model/base_url",
                            "actual": "",
                        }
                    )

            raw_endpoints = item.get("endpoints")
            if isinstance(raw_endpoints, list):
                if len(raw_endpoints) == 0:
                    issues.append(
                        {
                            "key": f"{item_key}.endpoints",
                            "code": "invalid_value",
                            "message": "endpoints must contain at least one endpoint",
                            "severity": "error",
                            "expected": "non-empty array",
                            "actual": "[]",
                        }
                    )
                    continue

                enabled_count = 0
                for ep_idx, ep in enumerate(raw_endpoints):
                    ep_key = f"{item_key}.endpoints[{ep_idx}]"
                    if not isinstance(ep, dict):
                        issues.append(
                            {
                                "key": ep_key,
                                "code": "invalid_type",
                                "message": "endpoint must be an object",
                                "severity": "error",
                                "expected": "object",
                                "actual": type(ep).__name__,
                            }
                        )
                        continue

                    enabled = ep.get("enabled", True)
                    if isinstance(enabled, str):
                        enabled = enabled.strip().lower() in {"true", "1", "yes", "on"}
                    elif not isinstance(enabled, bool):
                        enabled = True

                    if enabled:
                        enabled_count += 1

                    api_key = (ep.get("api_key") or "").strip()
                    if not api_key:
                        issues.append(
                            {
                                "key": ep_key,
                                "code": "missing_field",
                                "message": "endpoint api_key is required",
                                "severity": "error",
                                "expected": "non-empty api_key",
                                "actual": "",
                            }
                        )

                    verify_ssl = ep.get("verify_ssl")
                    if isinstance(verify_ssl, str):
                        issues.append(
                            {
                                "key": ep_key,
                                "code": "string_boolean",
                                "message": "verify_ssl should be boolean, string value is deprecated",
                                "severity": "warning",
                                "expected": "boolean",
                                "actual": verify_ssl,
                            }
                        )

                    temperature = ep.get("temperature")
                    if temperature not in (None, ""):
                        try:
                            temp_num = float(temperature)
                            if temp_num < 0 or temp_num > 2:
                                issues.append(
                                    {
                                        "key": ep_key,
                                        "code": "out_of_range",
                                        "message": "temperature should be between 0 and 2",
                                        "severity": "error",
                                        "expected": "0~2",
                                        "actual": str(temperature),
                                    }
                                )
                        except (TypeError, ValueError):
                            issues.append(
                                {
                                    "key": ep_key,
                                    "code": "invalid_type",
                                    "message": "temperature must be a number",
                                    "severity": "error",
                                    "expected": "number",
                                    "actual": str(temperature),
                                }
                            )

                if enabled_count == 0:
                    issues.append(
                        {
                            "key": f"{item_key}.endpoints",
                            "code": "missing_enabled_endpoint",
                            "message": "at least one enabled endpoint is required",
                            "severity": "error",
                            "expected": "enabled=true endpoint",
                            "actual": "all disabled",
                        }
                    )
            else:
                # 旧格式兼容校验
                api_key = (item.get("api_key") or "").strip()
                if not api_key:
                    issues.append(
                        {
                            "key": item_key,
                            "code": "missing_field",
                            "message": "api_key is required in legacy format",
                            "severity": "error",
                            "expected": "non-empty api_key",
                            "actual": "",
                        }
                    )

                verify_ssl = item.get("verify_ssl")
                if isinstance(verify_ssl, str):
                    issues.append(
                        {
                            "key": item_key,
                            "code": "string_boolean",
                            "message": "verify_ssl should be boolean, string value is deprecated",
                            "severity": "warning",
                            "expected": "boolean",
                            "actual": verify_ssl,
                        }
                    )

                temperature = item.get("temperature")
                if temperature not in (None, ""):
                    try:
                        temp_num = float(temperature)
                        if temp_num < 0 or temp_num > 2:
                            issues.append(
                                {
                                    "key": item_key,
                                    "code": "out_of_range",
                                    "message": "temperature should be between 0 and 2",
                                    "severity": "error",
                                    "expected": "0~2",
                                    "actual": str(temperature),
                                }
                            )
                    except (TypeError, ValueError):
                        issues.append(
                            {
                                "key": item_key,
                                "code": "invalid_type",
                                "message": "temperature must be a number",
                                "severity": "error",
                                "expected": "number",
                                "actual": str(temperature),
                            }
                        )

        return issues

    @staticmethod
    def _validate_cross_field(effective_map: Dict[str, str], updated_keys: Set[str]) -> List[Dict[str, Any]]:
        """Validate dependencies across multiple keys."""
        issues: List[Dict[str, Any]] = []

        token_value = (effective_map.get("TELEGRAM_BOT_TOKEN") or "").strip()
        chat_id_value = (effective_map.get("TELEGRAM_CHAT_ID") or "").strip()
        if token_value and not chat_id_value and (
            "TELEGRAM_BOT_TOKEN" in updated_keys or "TELEGRAM_CHAT_ID" in updated_keys
        ):
            issues.append(
                {
                    "key": "TELEGRAM_CHAT_ID",
                    "code": "missing_dependency",
                    "message": "TELEGRAM_CHAT_ID is required when TELEGRAM_BOT_TOKEN is set",
                    "severity": "error",
                    "expected": "non-empty TELEGRAM_CHAT_ID",
                    "actual": chat_id_value,
                }
            )

        if "EXTRA_AI_MODELS" in updated_keys:
            issues.extend(SystemConfigService._validate_extra_ai_models(effective_map.get("EXTRA_AI_MODELS", "")))

        return issues
