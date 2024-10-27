import axios from "axios";
import {OracleClient} from "@farmix-tg/oracle-sdk";
import {DEFAULT_PROD_NETWORK_CONF_URL, OracleNetworkConfigProvider} from "@farmix-tg/oracle-protocol";
import {TonClient} from "@ton/ton";
import {StonfiPositionV1, StonfiPositionV1FullConfig} from "@farmix-tg/sdk";


describe('rp points for farmer example', () => {
  it('example', async () => {
    const apiKey = 'XXX your api key from farmix scanner';
    const { data: farmersStats } = await axios.get('/api/v1/stats/positions/owners/active', {
      baseURL: 'https://api.farmix.tg/scanner',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    })

    const oracleClient = new OracleClient(
      new OracleNetworkConfigProvider(DEFAULT_PROD_NETWORK_CONF_URL),
    )

    // a little bit latter we will launch our own ton api v2
    const tonClientV2 = new TonClient({
      endpoint: 'https://toncenter.com/api/v2/jsonRPC',
      apiKey: 'XXX your api key from tonClient V2',
    })


    const jettonsRates = await oracleClient.getJettonRatesPlain({ dataServiceId: 'farmix-full' });

    // farmer addr -> usd value in all positions
    const farmerUsdValueInPositions: Record<string, number> = {}
    await Promise.all(farmersStats.owners.map(async (stat: any) => {
      const ownerAddr = stat.owner_addr;
      let usdValue = 0;
      await Promise.all(stat.positions.map(async (pos: any) => {
        const position = tonClientV2.open(StonfiPositionV1.create(pos.addr));
        const config = await position.getFullConfig();
        const oracleResponse = await oracleClient.requestDataPackagesForStonfiPositionV1(
          config as StonfiPositionV1FullConfig,
          { dataServiceId: 'farmix-full' },
        );

        const oracleData = OracleClient.dataPackagesResponseToCells(oracleResponse);
        const estimatedJettons = await position.getEstimatedJettons(
          oracleData.dataFeedsIdsCell,
          oracleData.payloadCell,
        );

        Object.entries(estimatedJettons.jettons).forEach(([jettonMasterAddr, jettonAmount]) => {
          const rate = jettonsRates[jettonMasterAddr];
          if (!rate) {
            throw new Error(`can not find rate for jetton ${jettonMasterAddr}`)
          }

          usdValue += Number(jettonAmount * rate.usdRateJettonDecimals / 10n ** BigInt(rate.decimals)) / 10 ** rate.decimals;
        })
      }))

      farmerUsdValueInPositions[ownerAddr] = usdValue;
    }))


    // this is your basis you rp points issue
    console.log(farmerUsdValueInPositions);
  })
})