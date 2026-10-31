from pyspark.sql import functions as F


def transform(tables):
    invoices = tables["invoices"]
    return (
        invoices.where(F.col("status") == "paid")
        .groupBy(F.date_trunc("month", "issued_at").alias("month"), "plan")
        .agg(F.sum("amount").alias("revenue"), F.countDistinct("customer_id").alias("customers"))
    )
