SELECT s.store_id, st.region, DATE(s.sold_at) AS day, SUM(s.amount) AS amount
FROM {{ tables.sales }} AS s
JOIN ${values.stores} AS st ON st.store_id = s.store_id
GROUP BY s.store_id, st.region, DATE(s.sold_at)
