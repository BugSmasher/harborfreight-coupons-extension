function handleSingleItemPage(priceboxdiv) {
    const itemno = findSingleItemNo();

    let saleCSS = false;
    if (priceboxdiv) {
        const salebox = priceboxdiv.querySelector('.sale');
        if (salebox) {
            saleCSS = true;
            priceboxdiv = salebox;
        }
    }

    if (itemno) {
        lookupCoupon(itemno, function(resp) {
            if (!resp || resp.error) {
                console.warn('Coupon lookup failed:', resp?.error || 'Unknown error');
                return;
            }

            const couponTitleText = document.createElement('span');
            couponTitleText.style.display = 'inline-block';
            couponTitleText.style.verticalAlign = 'top';
            couponTitleText.style.color = '#3a3a3a';
            
            const margin = saleCSS ? '-3px 5px 0 5px' : '5px 5px 0 10px';
            const fontSize = saleCSS ? '0.6em' : '1.3em';
            
            couponTitleText.style.margin = margin;
            couponTitleText.style.fontSize = fontSize;
            couponTitleText.title = 'Provided by hfqpdb.com';
            couponTitleText.innerText = resp.error || '';

            if (saleCSS) {
                priceboxdiv.appendChild(couponTitleText);
            } else {
                const compElement = priceboxdiv.querySelector('.comp');
                if (compElement) {
                    priceboxdiv.insertBefore(couponTitleText, compElement);
                } else {
                    priceboxdiv.appendChild(couponTitleText);
                }
            }

            if (resp.hasOwnProperty('bestPrice')) {
                let couponLinkText = '$' + resp.bestPrice;
                if ((resp.bestPrice + '').toLowerCase().includes('free')) {
                    couponLinkText = 'FREE';
                }
                couponTitleText.innerText = 'Best Coupon:';

                const couponLink = buildCouponLinkElement(couponLinkText, resp.url);
                couponLink.style.paddingLeft = '3px';
                couponLink.style.paddingRight = '3px';
                couponLink.style.position = 'absolute';
                couponLink.innerText = couponLinkText;
                
                if (saleCSS) {
                    priceboxdiv.appendChild(couponLink);
                } else {
                    couponLink.style.fontSize = '2.5em';
                    const compElement = priceboxdiv.querySelector('.comp');
                    if (compElement) {
                        priceboxdiv.insertBefore(couponLink, compElement);
                    } else {
                        priceboxdiv.appendChild(couponLink);
                    }
                }
            }
        });
    }
}

function displayCoupons() {
    const priceboxdivs = document.body.querySelectorAll('.price-box');

    if (!priceboxdivs || priceboxdivs.length === 0) {
        return;
    }

    // Handle single product page
    if (priceboxdivs.length === 1) {
        handleSingleItemPage(priceboxdivs[0]);
    }

    // Handle multiple products
    priceboxdivs.forEach(function(item) {
        let itemno = 0;
        let wishlist = false;
        
        if (window.location.pathname.includes('wishlist')) {
            wishlist = true;
            itemno = findWishlistItemNumber(item);
        } else {
            itemno = findListItemNumber(item);
        }

        if (itemno) {
            lookupCoupon(itemno, function(resp) {
                if (!resp || resp.error || !resp.hasOwnProperty('bestPrice')) {
                    return;
                }

                let couponLinkText = '$' + resp.bestPrice;
                if ((resp.bestPrice + '').toLowerCase().includes('free')) {
                    couponLinkText = 'FREE';
                }
                
                const couponLink = buildCouponLinkElement(couponLinkText, resp.url);
                couponLink.style.padding = '2px';
                couponLink.style.marginTop = '5px';
                couponLink.style.marginRight = '2px';
                couponLink.style.fontSize = '1.3em';
                
                if (!wishlist) {
                    couponLink.style.float = 'right';
                }

                let insertNode = item.querySelector('.clear');
                if (!insertNode) {
                    insertNode = item.querySelector('.comp');
                }
                
                if (insertNode) {
                    item.insertBefore(couponLink, insertNode);
                } else {
                    item.appendChild(couponLink);
                }
            });
        }
    });
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', displayCoupons);
} else {
    displayCoupons();
}
