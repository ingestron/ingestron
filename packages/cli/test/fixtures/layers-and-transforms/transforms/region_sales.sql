SELECT region, day, SUM(amount) AS amount
FROM {{ tables.store_sales }}
GROUP BY region, day
