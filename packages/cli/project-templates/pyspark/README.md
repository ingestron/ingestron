# PySpark

`monthly_revenue` is written in PySpark (`transform: { uses: pyspark }`).
[Its code](transforms/monthly_revenue.py) only defines
`transform(tables)`, which receives a DataFrame per input and returns the
result. The pack generates [a Python file](build/dev/src/subscriptions/silver/monthly_revenue.py)
that copies the code unchanged and wraps it as a materialised view with the
pipelines Python API (`from pyspark import pipelines as dp`): the full name,
comment and clustering from the definitions, and the checks as
`expect_all…` decorators.

The bronze table stays SQL; one pipeline runs both files.
