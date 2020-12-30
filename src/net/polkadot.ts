import { ApiPromise, WsProvider } from '@polkadot/api';
import {
  web3Accounts,
  web3Enable,
  web3FromSource,
} from '@polkadot/extension-dapp';
import { formatBalance } from '@polkadot/util';
import { evmToAddress } from '@polkadot/util-crypto';
import { Dispatch } from 'redux';

import Api from './api';
import Net from './';
import { setPolkadotJSFound, setPolkadotJSMissing } from '../redux/actions';

// Config
import { POLKADOT_API_PROVIDER } from '../config';
import { ETH_ASSET_ID } from '../config';

// Polkadot API connector
type Connector = (p: Polkadot, net: any) => void;

interface AssetAccountData {
  [free: string]: any;
}

export default class Polkadot extends Api {
  public conn?: ApiPromise;
  public net: Net;

  constructor(connector: Connector, net: any) {
    super();
    this.net = net;
    connector(this, net);
  }

  // Get all polkadot addresses
  public async get_addresses(dispatch: Dispatch) {
    // returns an array of all the injected sources
    const extensions = await web3Enable('Snowbridge');

    if (extensions.length === 0) {
      dispatch(setPolkadotJSMissing());
      return null;
    }
    dispatch(setPolkadotJSFound());

    const allAccounts = await web3Accounts();
    return allAccounts;
  }

  public async get_default_address() {
    const allAccounts = await web3Accounts();

    if (allAccounts[0]) {
      return allAccounts[0];
    } else {
      return null;
    }
  }

  // Query account balance for bridged assets (ETH and ERC20)
  public async get_balance(polkadotAddress: any) {
    try {
      if (this.conn) {
        if (polkadotAddress) {
          let accountData = await this.conn.query.asset.account(
            ETH_ASSET_ID,
            polkadotAddress,
          );

          if ((accountData as AssetAccountData).free) {
            return formatBalance(
              (accountData as AssetAccountData).free,
              { withSi: false },
              12,
            );
          }
        }

        throw new Error('Default account not found');
      }

      return null;
    } catch (err) {
      console.log(err);
      throw err;
    }
  }

  public async send_polkadot(amount: number) {
    const self = this;

    if (self.conn) {
      const account = await self.get_default_address();
      const recepient = evmToAddress(self.net.ethAddress);

      if (account) {
        const transferExtrinsic = self.conn.tx.balances.transfer(
          recepient,
          amount,
        );

        // to be able to retrieve the signer interface from this account
        // we can use web3FromSource which will return an InjectedExtension type
        const injector = await web3FromSource(account.meta.source);

        // passing the injected account address as the first argument of signAndSend
        // will allow the api to retrieve the signer and the user will see the extension
        // popup asking to sign the balance transfer transaction
        transferExtrinsic
          .signAndSend(
            account.address,
            { signer: injector.signer },
            ({ status }) => {
              if (status.isInBlock) {
                console.log(
                  `Completed at block hash #${status.asInBlock.toString()}`,
                );
              } else {
                console.log(`Current status: ${status.type}`);
              }
            },
          )
          .catch((error: any) => {
            console.log(':( transaction failed', error);
          });
      } else {
        throw new Error('Default Polkadot account not found');
      }
    } else {
      throw new Error('Polkadot API not connected');
    }
  }

  // Polkadotjs API connector
  public static async connect(dispatch: Dispatch): Promise<Connector> {
    try {
      const wsProvider = new WsProvider(POLKADOT_API_PROVIDER);

      const api = await ApiPromise.create({
        provider: wsProvider,
        types: {
          Address: 'AccountId',
          LookupSource: 'AccountId',
          AppId: '[u8; 20]',
          Message: {
            payload: 'Vec<u8>',
            verification: 'VerificationInput',
          },
          VerificationInput: {
            _enum: {
              Basic: 'VerificationBasic',
              None: null,
            },
          },
          VerificationBasic: {
            blockNumber: 'u64',
            eventIndex: 'u32',
          },
          TokenId: 'H160',
          BridgedAssetId: 'H160',
          AssetAccountData: {
            free: 'U256',
          },
        },
      });

      return async (polkadot: Polkadot) => {
        polkadot.conn = api;
        console.log('- Polkadot API endpoint connected');
      };
    } catch (err) {
      console.log(err);
      throw new Error('Poldotjs API endpoint not Connected');
    }
  }
}
