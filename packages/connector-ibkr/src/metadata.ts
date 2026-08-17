// Keep connector metadata in the TypeScript source because this package is also
// loaded directly by the engine's tsx child process during development.
const iconSvg = `<svg version="1.2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 775 1511" width="775" height="1511">
	<title>Interactive Brokers Logo</title>
	<defs>
		<linearGradient id="g1" x1="667.4" y1="1142.8" x2="-0.7" y2="1142.8" gradientUnits="userSpaceOnUse">
			<stop offset="0" stop-color="#d81222"/>
			<stop offset="1" stop-color="#960b1a"/>
		</linearGradient>
	</defs>
	<style>
		.s0 { fill: url(#g1) }
		.s1 { fill: #d81222 }
	</style>
	<g id="layer1">
		<g id="g9910">
			<path id="polygon9702" class="s0" d="m0.3 1510.2v-734.9l668 734.9z"/>
			<path id="circle9704" class="s1" d="m574.2 1154.6c-110.5 0-199.9-89.5-199.9-200.2 0-110.8 89.4-200.3 199.9-200.3 110.6 0 200 89.5 200 200.3 0 110.7-89.4 200.2-200 200.2z"/>
			<path id="polygon9706" class="s1" d="m668.3 0.4l-668 1509.8v-734.9z"/>
		</g>
	</g>
</svg>
`;

export const ibkrIcon = `data:image/svg+xml;base64,${Buffer.from(iconSvg).toString("base64")}`;

export const ibkrInstructions = `# Interactive Brokers Flex Query

Configure an **Activity Flex Query** with XML output and the **Last Business Day** period.

| Section | Settings | Fields |
| --- | --- | --- |
| Account Information | — | Account ID, Account Alias, Currency, Name |
| Open Positions | Summary | Account ID, Currency, Asset Class, Symbol, Description, Conid, Security ID, Security ID Type, CUSIP, ISIN, FIGI, Quantity, Multiplier, Level of Detail |
| Cash Report | Currency Breakout | Account ID, Currency, Ending Cash |

Select the accounts to include, enable Flex Web Service, then enter the token and Activity Query ID in Optimus.
`;
