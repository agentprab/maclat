import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
export function generateTempWallet() {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    return { address: account.address, privateKey };
}
//# sourceMappingURL=escrow.js.map