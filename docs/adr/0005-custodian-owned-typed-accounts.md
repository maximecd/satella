# Custodian-owned typed accounts

We reinstated the Custodian as a mandatory parent of every Account (`Custodian → Account → Position → Asset`), six days after removing it in favour of optional Connection ownership. Accounts are now typed (`checking`, `savings`, `brokerage`, `crypto_wallet`, `other`) and every holding must live inside this hierarchy, because that is how people actually think about money: a bank holds a Livret A, a broker holds a PEA, and nothing floats free. The Connection entity is dissolved: a Custodian is *synced* when it carries a `connector_id`, in which case its accounts are read-only.

## Considered Options

- **Connection as the parent** (the model this replaces): rejected because a Connection is a technical sync link, not the institution a user pictures; it also could not own manually entered accounts.
- **Typed accounts with SQL-enforced constraints**: rejected — business rules (one currency per cash account, read-only synced accounts) are validated in the engine only, keeping migrations dumb.
