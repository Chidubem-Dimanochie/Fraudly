import numpy as np
import pandas as pd

def add_engineered_features(X_in):
    """
    Input: pandas DataFrame with columns: Amount, Hour
    Output: DataFrame with extra columns derived from them.

    Backend contract stays the same:
    backend sends Amount + Hour, pipeline creates everything else.
    """
    X_df = X_in.copy()

    amt = X_df["Amount"].astype(float)
    X_df["LogAmount"] = np.log1p(amt)

    hour = X_df["Hour"].astype(float)
    X_df["HourSin"] = np.sin(2 * np.pi * hour / 24.0)
    X_df["HourCos"] = np.cos(2 * np.pi * hour / 24.0)

    X_df["Amount_x_Hour"] = amt * (hour / 23.0)

    return X_df
