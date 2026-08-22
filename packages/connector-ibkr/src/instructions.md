# Interactive Brokers Flex Query

Configure an **Activity Flex Query** with XML output and the **Last Business Day** period.

| Section | Settings | Fields |
| --- | --- | --- |
| Account Information | — | Account ID, Account Alias, Currency, Name |
| Open Positions | Summary | Account ID, Currency, Asset Class, Symbol, Description, Conid, Security ID, Security ID Type, CUSIP, ISIN, FIGI, Quantity, Multiplier, Cost Basis Price, Cost Basis Money, FIFO Unrealized PNL, Level of Detail |
| Cash Report | Currency Breakout | Account ID, Currency, Ending Cash |

Select the accounts to include, enable Flex Web Service, then enter the token and Activity Query ID in Satella.

Satella imports the Summary row's **Cost Basis Price** as the Position's Average unit purchase price and derives current Unrealized P&L from it. **FIFO Unrealized PNL** is included for report visibility but is not used as the product's authoritative P&L because it follows IBKR's FIFO calculation semantics.
