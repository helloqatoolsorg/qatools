
(()=>{
  const LIKE_KEY='qatools_likes';
  const CART_KEY='qatools_cart';

  function readLikes(){
    return new Set(JSON.parse(localStorage.getItem(LIKE_KEY)||'[]'));
  }

  function readCart(){
    const purchased=new Set(window.QA_PURCHASED_IDS||[]);
    return new Set(
      JSON.parse(localStorage.getItem(CART_KEY)||'[]')
        .filter(id=>!purchased.has(id))
    );
  }

  function paintTopShelf(){
    const likes=readLikes();
    const cart=readCart();

    document.querySelectorAll('.liked-nav-link').forEach(link=>{
      const icon=link.querySelector('.liked-icon');
      const count=link.querySelector('.liked-count');

      link.classList.toggle('has-likes',likes.size>0);
      if(icon) icon.textContent=likes.size>0?'♥':'♡';
      if(count) count.textContent=likes.size?String(likes.size):'';
    });

    document.querySelectorAll('#cartButton').forEach(button=>{
      button.classList.toggle('cart-has-items',cart.size>0);
      const count=button.querySelector('#cartCount, .cart-count');
      if(count) count.textContent=cart.size?String(cart.size):'';
    });
  }

  window.qaPaintTopShelf=paintTopShelf;

  window.addEventListener('qatools-likes-updated',paintTopShelf);
  window.addEventListener('qatools-cart-updated',paintTopShelf);
  window.addEventListener('storage',paintTopShelf);

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',paintTopShelf);
  }else{
    paintTopShelf();
  }
})();
