/**
 * Space Resource Exchange – Wallet integration (MetaMask / EIP-1193)
 */

const WalletState = {
  connected: false,
  address: null,
  chainId: null,
  provider: null,
};

async function connectWallet() {
  if (typeof window.ethereum === "undefined") {
    throw new Error(
      "No Ethereum wallet detected. Please install MetaMask or a compatible wallet extension."
    );
  }

  const accounts = await window.ethereum.request({
    method: "eth_requestAccounts",
  });

  if (!accounts || accounts.length === 0) {
    throw new Error("No accounts returned from wallet.");
  }

  WalletState.address = accounts[0];
  WalletState.connected = true;
  WalletState.provider = window.ethereum;

  const chainIdHex = await window.ethereum.request({ method: "eth_chainId" });
  WalletState.chainId = parseInt(chainIdHex, 16);

  // Listen for account / chain changes
  window.ethereum.on("accountsChanged", (newAccounts) => {
    if (newAccounts.length === 0) {
      disconnectWallet();
    } else {
      WalletState.address = newAccounts[0];
      document.dispatchEvent(
        new CustomEvent("walletChanged", { detail: WalletState })
      );
    }
  });

  window.ethereum.on("chainChanged", (newChain) => {
    WalletState.chainId = parseInt(newChain, 16);
    document.dispatchEvent(
      new CustomEvent("walletChanged", { detail: WalletState })
    );
  });

  return WalletState;
}

function disconnectWallet() {
  WalletState.connected = false;
  WalletState.address = null;
  WalletState.chainId = null;
  document.dispatchEvent(
    new CustomEvent("walletChanged", { detail: WalletState })
  );
}

function shortAddress(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

/**
 * Sign a contract payload as a typed EIP-712 message so the
 * on-chain record can be verified later without a full transaction.
 */
async function signContractMessage(contractData) {
  if (!WalletState.connected) {
    throw new Error("Wallet not connected.");
  }

  const message = JSON.stringify(contractData, null, 2);
  const msgHex =
    "0x" +
    Array.from(new TextEncoder().encode(message))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  const signature = await window.ethereum.request({
    method: "personal_sign",
    params: [msgHex, WalletState.address],
  });

  return signature;
}

/**
 * Send ETH/ERC-20 premium payment to counterparty.
 * In production this would call a deployed options smart-contract;
 * here we demonstrate the raw eth_sendTransaction flow.
 */
async function sendPremiumPayment(toAddress, etherAmount) {
  if (!WalletState.connected) {
    throw new Error("Wallet not connected.");
  }

  const weiHex =
    "0x" + BigInt(Math.round(etherAmount * 1e18)).toString(16);

  const txHash = await window.ethereum.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: WalletState.address,
        to: toAddress,
        value: weiHex,
        gas: "0x5208", // 21 000
      },
    ],
  });

  return txHash;
}

export {
  WalletState,
  connectWallet,
  disconnectWallet,
  shortAddress,
  signContractMessage,
  sendPremiumPayment,
};
