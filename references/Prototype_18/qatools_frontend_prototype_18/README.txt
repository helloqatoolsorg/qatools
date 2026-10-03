QA TOOLS — FRONTEND VISUAL PROTOTYPE 18

SAFE CHECKPOINT
Prototype 17 is the safe known-good checkpoint.

NEW VOCABULARY
- cart menu = drop-left cart menu available from every page
- cart page = dedicated full page opened by GO TO CART

CART PAGE
- New cart.html.
- GO TO CART in every cart menu now opens cart.html.
- Cart page reflects the same shared cart state as:
  cart menu
  main page card
  tool page
- Removing an item from cart page removes it from the shared cart state.
- Each item row is clickable and opens its tool page.
- Layout includes:
  item miniature
  item title / subtitle
  category
  complexity
  compatibility
  version
  price
  remove control
  item count
  subtotal
  total
  checkout button
- Empty cart state included.

CORE RULE
One item = one shared state everywhere.
