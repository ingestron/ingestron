SELECT c.customer_id, c.name, SUM(i.amount) AS balance
FROM {{ tables.customers }} AS c
JOIN {{ tables.invoices }} AS i ON i.customer_id = c.customer_id
WHERE i.__END_AT IS NULL AND i.status = 'open'
GROUP BY c.customer_id, c.name
