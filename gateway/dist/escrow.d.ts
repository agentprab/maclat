export interface TempWallet {
    address: string;
    privateKey: string;
}
export declare function generateTempWallet(): TempWallet;
