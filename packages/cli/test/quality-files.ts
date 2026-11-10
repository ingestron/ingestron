// The files every engine's medallion project shares (quality-projects.ts): the contracts,
// the data product, the standard, the flow and the transforms, each made for an engine.

export const contract = (tags: string, lastSeen: string) => `apiVersion: v3.1.0
kind: DataContract
id: crm.customers
version: 1.0.0
status: active
schema:
  - name: customers
    logicalType: object
    description: CRM customers.
    properties:
      - { name: id, logicalType: integer, required: true, primaryKey: true }
      - name: email
        logicalType: string
        required: true
        logicalTypeOptions: { minLength: 3, pattern: "^[^@]+@[^@]+$" }
      - { name: name, logicalType: string, logicalTypeOptions: { maxLength: 100 } }
      - name: country
        logicalType: string
        quality:
          - type: library
            metric: invalidValues
            arguments: { validValues: [GB, IE, FR] }
            mustBe: 0
      - name: status
        logicalType: string
        quality:
          - type: library
            metric: missingValues
            arguments: { missingValues: [null, "n/a"] }
            mustBe: 0
      - { name: age, logicalType: integer, logicalTypeOptions: { minimum: 0, exclusiveMaximum: 150 } }
      - { name: score, logicalType: integer, logicalTypeOptions: { multipleOf: 5 } }
      - name: tags
        logicalType: array${tags}
        logicalTypeOptions: { minItems: 1, maxItems: 5, uniqueItems: true }
      - { name: vip, logicalType: boolean }
      - { name: contacted_at, logicalType: timestamp }
      - { name: last_seen, logicalType: timestamp${lastSeen} }
      - { name: updated_at, logicalType: timestamp, required: true }
    quality:
      - { type: library, metric: rowCount, mustBeGreaterThan: 0, name: some_customers }
      - { type: text, name: one_per_person, description: Each person is one customer. }
`;

export const orders = `apiVersion: v3.1.0
kind: DataContract
id: crm.orders
version: 1.0.0
status: active
schema:
  - name: orders
    logicalType: object
    description: One row per order, kept current.
    properties:
      - { name: id, logicalType: integer, required: true, primaryKey: true }
      - { name: customer_id, logicalType: integer, required: true }
      - { name: status, logicalType: string }
      - { name: total, logicalType: number, physicalType: "DECIMAL(18,2)" }
      - { name: updated_at, logicalType: timestamp, required: true }
`;

export const product = `apiVersion: v1.1.0
kind: DataProduct
id: crm
name: Customer records
status: active
description:
  purpose: Customers and their orders, cleansed, one row each.
team:
  members:
    - { username: mia@example.com, name: Mia Chen, role: owner }
outputPorts:
  - { name: customers, contractId: crm.customers }
  - { name: orders, contractId: crm.orders }
`;

export const standard = (packs: string, extra = "") => `apiVersion: ingestron.io/v1
kind: Standard
id: medallion
packs: [${packs}]
layers:
  - { name: bronze, does: raw }
  - name: silver
    does: [cleanse, deduplicate, check, quarantine]
    quality: { results: true }
cleanse:
  text: { trim: true, empty: null }
  timestamps: { to: UTC }
quality:
  required: drop
  quarantine: true
${extra}`;

export const flow = (customers: string, orders: string) => `apiVersion: ingestron.io/v1
kind: Flow
id: crm
description: Customers and orders from the CRM, as they come.
source: crm
layer: bronze
tables:
  customers:
    object: ${customers}
    contract: crm.customers
  orders:
    object: ${orders}
    contract: crm.orders
`;

export const customersClean = (check: string) => `apiVersion: ingestron.io/v1
kind: Transform
id: customers_clean
description: Customers, cleansed, one row each.
layer: silver
inputs: [customers]
contract: crm.customers
cleanse:
  columns:
    email: { case: lower }
    name: { trim: false }
    country: { map: { "United Kingdom": GB, UK: GB, "-": null }, case: upper }
    status: { default: active }
    vip: { default: false }
    contacted_at: { timezone: { from: UTC, to: Europe/London } }
  deduplicate: { order_by: [updated_at] }
expectations:
  - { name: recent, check: "${check}", action: fail }
`;

export const ordersClean = (code: string) => `apiVersion: ingestron.io/v1
kind: Transform
id: orders_clean
description: Orders with a known customer, one row each.
layer: silver
inputs: [orders]
contract: crm.orders
${code}cleanse:
  columns:
    status: { case: upper }
  deduplicate: { order_by: [updated_at] }
`;
