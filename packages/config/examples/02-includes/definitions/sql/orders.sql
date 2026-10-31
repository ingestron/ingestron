SELECT order_id, amount
FROM ${source_catalog}.sales.orders
WHERE order_date = '{{ run_date }}'
