# Categorize assets, not accounts

Assets carry one intrinsic category—Stocks & ETFs, Crypto, Cash, or Other assets—while accounts are typed containers that constrain which assets they may hold. This keeps portfolio allocation on the asset taxonomy and correctly classifies cases such as cash held inside a brokerage account. Derivatives and Commodities are not first-class V0 categories; connector holdings formerly classified that way remain represented as Other assets rather than being discarded.

ADR 0005 supersedes the earlier untyped-account and Bonds decisions: accounts are now typed, and Bonds is no longer a V0 category.
