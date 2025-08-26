// Modern JavaScript with better error handling
const itemRegex = /\d+/g;

// Polyfill for String.prototype.matchAll if needed
if (!String.prototype.matchAll) {
    String.prototype.matchAll = function(regexp) {
        const matches = [];
        this.replace(regexp, function() {
            const arr = ([]).slice.call(arguments, 0);
            const extras = arr.splice(-2);
            arr.index = extras[0];
            arr.input = extras[1];
            matches.push(arr);
        });
        return matches.length ? matches : null;
    };
}

function lookupCoupon(itemno, callback) {
    chrome.runtime.sendMessage({
        action: "lookup_coupon",
        itemno: itemno
    }, function(data) {
        if (chrome.runtime.lastError) {
            console.error('Runtime error:', chrome.runtime.lastError);
            callback({ error: 'Failed to communicate with extension' });
            return;
        }
        callback(data || { error: 'No data received' });
    });
}

function findSingleItemNo() {
    let itemno = 0;
    try {
        const metaElement = document.querySelector("meta[property='og:product_id']");
        if (metaElement) {
            itemno = metaElement.getAttribute("content");
        }
    } catch (ex) {
        console.warn('Failed to get product ID from meta tag:', ex);
    }
    
    if (!itemno) {
        try {
            const titleElement = document.getElementsByClassName("title-infor")[0];
            if (titleElement) {
                const matches = titleElement.innerText.matchAll(itemRegex);
                if (matches) {
                    itemno = matches[matches.length - 1];
                }
            }
        } catch (ex) {
            console.warn('Failed to get product ID from title:', ex);
        }
    }
    
    return itemno;
}

function findListItemNumber(priceboxdiv) {
    let itemno = 0;
    try {
        const productIdsElement = priceboxdiv.parentNode.querySelector('.product-ids');
        if (productIdsElement) {
            const matches = productIdsElement.innerText.matchAll(itemRegex);
            if (matches) {
                itemno = matches[matches.length - 1];
            }
        }
    } catch (ex) {
        console.warn('Failed to get list item number:', ex);
    }
    return itemno;
}

function findWishlistItemNumber(priceboxdiv) {
    let itemno = 0;
    try {
        const wishlistSkuElement = priceboxdiv.parentNode.parentNode.querySelector('.wishlist-sku');
        if (wishlistSkuElement) {
            const matches = wishlistSkuElement.innerText.matchAll(itemRegex);
            if (matches) {
                itemno = matches[matches.length - 1];
            }
        }
    } catch (ex) {
        console.warn('Failed to get wishlist item number:', ex);
    }
    return itemno;
}

function buildCouponLinkElement(text, url) {
    const a = document.createElement('a');
    a.href = url;
    a.innerText = text;
    a.style.display = 'inline-block';
    a.style.border = '2px dashed #308104';
    a.style.color = '#308104';
    a.title = 'Provided by hfqpdb.com';
    a.target = '_blank'; // Open in new tab for security
    a.rel = 'noopener noreferrer'; // Security best practice
    return a;
}
