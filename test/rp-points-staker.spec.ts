import axios from "axios";
import {TonClient} from "@ton/ton";
import {JettonPoolV1} from "@farmix-tg/sdk";
import {OracleClient} from "@farmix-tg/oracle-sdk";
import {DEFAULT_PROD_NETWORK_CONF_URL, OracleNetworkConfigProvider} from "@farmix-tg/oracle-protocol";

export const RAY = 1000000000000000000000000000n;
export const WAD = 1000000000000000000n;
export const SECONDS_PER_YEAR = 31536000n;
export const PERCENTAGE_FACTOR = 10000n;

describe('rp points for stakers calc example', () => {
  it('example', async () => {
    const apiKey = 'XXX your api key from farmix scanner';

    const { data: stakersStats } = await axios.get('api/v1/stats/stakers', {
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

    // Record<stakerAddr, Record<poolAddr, currentFibAmount>>
    const stakersCurrentFibJettons: Record<string, Record<string, bigint>> = {};
    stakersStats.stakers.forEach((stat: any) => {
      const stakerAddr = stat.staker_addr;
      const fibJettons: Record<string, bigint> = {};
      stat.cumulatives.forEach((cumulativeStat: any) => {
        const poolAddr = cumulativeStat.farmix_pool;
        let currentFibJettons = BigInt(cumulativeStat.cumulative_fib_minted) - BigInt(cumulativeStat.cumulative_fib_burned);
        if (currentFibJettons < 0n) {
          currentFibJettons = 0n;
        }
        fibJettons[poolAddr] = currentFibJettons;
      })

      stakersCurrentFibJettons[stakerAddr] = fibJettons;
    })


    // ... end then you store this on daily basis
    console.log(stakersCurrentFibJettons);


    // ... then after a week you get this records and choose MIN amount for each staker for each pool

    // then you need to convert fib jettons to usd to calc how much of rp points you need to issue

    // staker_addr -> staker stack from all pools in usd amount

    const jettonsRates = await oracleClient.getJettonRatesPlain({ dataServiceId: 'farmix-full' });

    const stakersUsdStakes: Record<string, number> = {};
    await Promise.all(Object.entries(stakersCurrentFibJettons).map(async ([stakerAddr,  fibJettons]) => {
      let stakeUsdValue = 0;
      await Promise.all(Object.entries(fibJettons).map(async ([poolAddr, fibAmount]) => {
        const pool = tonClientV2.open(JettonPoolV1.create(poolAddr));
        const fibRateRAY = await pool.getPoolFibRateRAY();
        const fullConfig = await pool.getFullConfig();
        const underlyingJettonMasterAddr = fullConfig.roles_content_code!.r_jetton_master_addr!;
        const underlyingJettonAmount = fibAmount * fibRateRAY / RAY;

        const rate = jettonsRates[underlyingJettonMasterAddr.toString({ urlSafe: true, bounceable: true })];
        if (!rate) {
          throw new Error(`can not find rate for jetton ${underlyingJettonMasterAddr}`)
        }

        stakeUsdValue += Number(underlyingJettonAmount * rate.usdRateJettonDecimals / 10n ** BigInt(rate.decimals)) / 10 ** rate.decimals;
      }))

      stakersUsdStakes[stakerAddr] = stakeUsdValue;
    }))


    // this is your basis to issue rp points, then only quest logic
    console.log(stakersUsdStakes);
  })

})