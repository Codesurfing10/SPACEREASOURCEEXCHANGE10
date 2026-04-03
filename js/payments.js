/**
 * Space Resource Exchange – Stripe payment integration
 *
 * Uses Stripe.js loaded from the Stripe CDN (no server required for
 * tokenisation).  Actual charge creation requires a backend endpoint;
 * here we show the tokenisation flow and indicate where the server
 * call would be made.
 *
 * Replace STRIPE_PUBLISHABLE_KEY with your real publishable key.
 */

const STRIPE_PUBLISHABLE_KEY = "pk_test_REPLACE_WITH_YOUR_STRIPE_KEY";

let _stripe = null;
let _elements = null;
let _cardElement = null;

function initStripe() {
  if (!window.Stripe) {
    console.warn("Stripe.js not loaded yet – skipping init.");
    return;
  }
  _stripe = window.Stripe(STRIPE_PUBLISHABLE_KEY);
}

/**
 * Mount a Stripe card element inside `containerId`.
 * Returns the card element so the caller can unmount it later.
 */
function mountCardElement(containerId) {
  if (!_stripe) initStripe();
  if (!_stripe) return null;

  _elements = _stripe.elements();
  _cardElement = _elements.create("card", {
    style: {
      base: {
        color: "#e2e8f0",
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        fontSize: "16px",
        "::placeholder": { color: "#64748b" },
        backgroundColor: "transparent",
      },
      invalid: { color: "#f87171" },
    },
  });
  _cardElement.mount(`#${containerId}`);
  return _cardElement;
}

/**
 * Tokenise the card details entered by the user.
 * In a real app the returned token is sent to YOUR server which
 * calls stripe.charges.create() or creates a PaymentIntent.
 */
async function tokeniseCard(billingDetails) {
  if (!_stripe || !_cardElement) {
    throw new Error("Stripe not initialised or card element not mounted.");
  }

  const { token, error } = await _stripe.createToken(_cardElement, {
    name: billingDetails.name || "Space Trader",
  });

  if (error) throw new Error(error.message);

  return token;
}

/**
 * Simulate the server-side charge.
 * Replace this stub with a real fetch() call to your backend.
 *
 * POST /api/charge { token, amountUsd, description }
 */
async function simulateCharge(token, amountUsd, description) {
  console.info(
    `[Stripe] Would charge $${amountUsd.toFixed(2)} for "${description}" using token ${token.id}`
  );
  // Simulate network delay
  await new Promise((r) => setTimeout(r, 800));
  return {
    success: true,
    chargeId: "ch_simulated_" + Math.random().toString(36).slice(2),
    amountUsd,
    description,
  };
}

function unmountCardElement() {
  if (_cardElement) {
    _cardElement.unmount();
    _cardElement = null;
  }
}

export {
  initStripe,
  mountCardElement,
  tokeniseCard,
  simulateCharge,
  unmountCardElement,
  STRIPE_PUBLISHABLE_KEY,
};
