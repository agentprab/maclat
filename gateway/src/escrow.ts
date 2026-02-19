import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

export interface TempWallet {
  address: string;
  privateKey: string;
}

export function generateTempWallet(): TempWallet {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return { address: account.address, privateKey };
}
