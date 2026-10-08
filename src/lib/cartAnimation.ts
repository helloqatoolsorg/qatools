export function animateToCart(
  image: HTMLImageElement | null
) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const cartIcon =
    document.getElementById(
      "cartButton"
    );

  if (!image || !cartIcon) {
    return;
  }

  const imageRect =
    image.getBoundingClientRect();

  const cartRect =
    cartIcon.getBoundingClientRect();

  /*
    Size of the miniature that flies
    toward the cart.
  */
  const flyerWidth =
    Math.min(
      imageRect.width,
      150
    );

  const flyerHeight =
    Math.min(
      imageRect.height,
      100
    );

  /*
    Start from the exact CENTER
    of the image.
  */
  const startLeft =
    imageRect.left +
    imageRect.width / 2 -
    flyerWidth / 2;

  const startTop =
    imageRect.top +
    imageRect.height / 2 -
    flyerHeight / 2;

  /*
    End at the exact CENTER
    of the cart button.
  */
  const cartCenterX =
    cartRect.left +
    cartRect.width / 2;

  const cartCenterY =
    cartRect.top +
    cartRect.height / 2;

  const flyerCenterX =
    startLeft +
    flyerWidth / 2;

  const flyerCenterY =
    startTop +
    flyerHeight / 2;

  const translateX =
    cartCenterX -
    flyerCenterX;

  const translateY =
    cartCenterY -
    flyerCenterY;

  /*
    Clone the product image.
  */
  const flyer =
    image.cloneNode(
      true
    ) as HTMLImageElement;

  flyer.className =
    "cart-flyer";

  Object.assign(
    flyer.style,
    {
      position: "fixed",

      left:
        `${startLeft}px`,

      top:
        `${startTop}px`,

      width:
        `${flyerWidth}px`,

      height:
        `${flyerHeight}px`,

      objectFit:
        "cover",

      pointerEvents:
        "none",

      zIndex:
        "9999",

      opacity:
        "0.9",

      transform:
        "translate(0, 0) scale(1)",

      transformOrigin:
        "center center",

      transition:
        "transform 650ms ease, opacity 650ms ease",
    }
  );

  document.body.appendChild(
    flyer
  );

  requestAnimationFrame(
    () => {
      flyer.style.transform =
        `translate(${translateX}px, ${translateY}px) scale(.08)`;

      flyer.style.opacity =
        "0";
    }
  );

  window.setTimeout(
    () => {
      flyer.remove();
    },
    700
  );
}