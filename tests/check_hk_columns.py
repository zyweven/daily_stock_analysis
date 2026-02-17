
import akshare as ak
import pandas as pd

try:
    print("Fetching HK stock spot data...")
    df = ak.stock_hk_spot_em()
    print(f"Columns: {list(df.columns)}")
    
    # Check 01810
    row = df[df['代码'] == '01810']
    if not row.empty:
        print("Data for 01810:")
        print(row.iloc[0].to_dict())
    else:
        print("01810 not found in spot data.")
        
except Exception as e:
    print(f"Error: {e}")
