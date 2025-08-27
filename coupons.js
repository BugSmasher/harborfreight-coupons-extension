// Global variables for tracking processed SKUs and current page
var processedSkus = new Set();
var lastProcessedUrl = '';

// Add this at the top of your file
let keepAliveInterval;

// Add this function after your variable declarations at the top

// Function to check if extension context is still valid
function isExtensionContextValid() {
    return !!(chrome && chrome.runtime && chrome.runtime.sendMessage);
}

// Function to keep extension alive
function keepExtensionAlive() {
    if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
        // Send a ping to keep the extension context alive
        try {
            chrome.runtime.sendMessage({type: 'ping'}, function(response) {
                if (chrome.runtime.lastError) {
                    console.log('Extension context still valid');
                }
            });
        } catch (e) {
            console.log('Extension context check completed');
        }
    }
}

// Start the keep-alive mechanism
function startKeepAlive() {
    // Check every 30 seconds to keep extension alive
    keepAliveInterval = setInterval(keepExtensionAlive, 30000);
    //console.log('Extension keep-alive started');
}

// Stop the keep-alive mechanism
function stopKeepAlive() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
        //console.log('Extension keep-alive stopped');
    }
}

function displayCoupons() {
    const currentUrl = window.location.href;
    
    // Check if URL changed (SPA navigation)
    if (lastProcessedUrl !== currentUrl) {
        //console.log('URL changed, clearing processed SKUs');
        processedSkus.clear();
        lastProcessedUrl = currentUrl;
    }
    
    // Check if extension context is still valid
    if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
        //console.error('Extension context invalid - stopping coupon display');
        return;
    }
    
    // Add debugging to see the flow
    //console.log('=== Harbor Freight Coupons Extension Debug ===');
    //console.log('Current URL:', currentUrl);
    //console.log('Pathname includes .html:', window.location.pathname.includes('.html'));

    // Update the single product page detection to be more specific
    if (window.location.pathname.includes('.html') && 
        window.location.pathname.match(/\d+\.html$/)) {
        //console.log('Single product page detected, looking for desktop price container...');
        
        // Look for desktop-only price container (exclude mobile bar versions)
        const mainPriceContainer = document.querySelector('[data-testid="priceWrap"]:not(.price__mobileBar):not([class*="mobileBar"]), .price__container:not(.price__mobileBar):not([class*="mobileBar"])');
        //console.log('Desktop price container query result:', mainPriceContainer);
        
        if (!mainPriceContainer) {
            //console.log('Desktop price container not loaded yet, scheduling retry...');
            setTimeout(displayCoupons, 1000);
            return;
        }
        //console.log('Desktop price container found, proceeding...');
        
        // For single product pages, ONLY process the desktop price container
        const itemno = findSingleItemNo();
        //console.log('findSingleItemNo() returned:', itemno);
        
        if (itemno && !processedSkus.has(itemno)) {
            //console.log('Processing single product with SKU:', itemno);
            processedSkus.add(itemno);
            addCouponToElement(mainPriceContainer, itemno);
        } else if (!itemno) {
            //console.log('No item number found, scheduling retry...');
            setTimeout(displayCoupons, 1000);
        } else {
            //console.log('Item number found but already processed:', itemno);
        }
        return;
    } else {
        //console.log('Not a single product page, processing as search results...');
        
        // Search results page - check if we have new content to process
        const allPriceElements = document.querySelectorAll('[class*="price"]');
        //console.log('Found price elements:', allPriceElements.length);
        
        if (allPriceElements.length === 0) {
            //console.log('No price elements found, scheduling retry...');
            setTimeout(displayCoupons, 1000);
            return;
        }
        
        // Check if search results are currently loading/changing
        const loadingElements = document.querySelectorAll('[class*="loading"], [class*="spinner"], [class*="overlay"]');
        const hasLoadingState = loadingElements.length > 0;
        
        if (hasLoadingState) {
            //console.log('Search results are loading, waiting for completion...');
            setTimeout(displayCoupons, 500); // Check again soon
            return;
        }
        
        // Check if we have new products that we haven't processed yet
        let hasNewProducts = false;
        let newProductCount = 0;
        
        for (const priceElement of allPriceElements) {
            const productCard = findProductCard(priceElement);
            if (productCard) {
                const sku = extractSkuFromProductCard(productCard);
                if (sku && !processedSkus.has(sku)) {
                    hasNewProducts = true;
                    newProductCount++;
                }
            }
        }
        
        if (!hasNewProducts) {
            //console.log('No new products found, all SKUs already processed');
            return; // Don't retry if we've already processed everything
        }
        
        //console.log(`Found ${newProductCount} new products to process...`);
        
        // Filter out mobile price elements for search results
        const desktopPriceElements = Array.from(allPriceElements).filter(el => {
            return !el.classList.contains('mobile-bar__') && 
                   !el.closest('.mobile-bar') && 
                   !el.closest('[class*="mobile-bar"]');
        });
        
        //console.log('Desktop price elements after filtering:', desktopPriceElements.length);
        
        // Process only the new products
        let processedAny = false;
        desktopPriceElements.forEach(function(priceElement) {
            const productCard = findProductCard(priceElement);
            if (productCard) {
                const sku = extractSkuFromProductCard(productCard);
                if (sku && !processedSkus.has(sku)) {
                    //console.log('Processing search result with SKU:', sku);
                    processedSkus.add(sku);
                    addCouponToElement(priceElement, sku);
                    processedAny = true;
                }
            }
        });
        
        if (processedAny) {
            //console.log('Successfully processed new products');
        }
    }
}

// Add this function after your findBestPriceElement function

// Simple function to add coupon to an element
function addCouponToElement(priceElement, itemno) {
    // Check if coupon already exists
    if (priceElement.querySelector('[data-hf-coupon]')) {
        //console.log('Coupon already exists for this element, skipping...');
        return;
    }
    
    //console.log('Looking up coupon for SKU:', itemno);
    
    lookupCoupon(itemno, function(resp) {
        if (!resp || resp.error || !resp.hasOwnProperty('bestPrice')) {
            //console.log('Coupon lookup failed for item:', itemno, resp);
            return;
        }
        
        //console.log('Found coupon for item:', itemno, resp);
        
        let couponText = 'HFQPDB - $' + resp.bestPrice;
        if ((resp.bestPrice + '').toLowerCase().includes('free')) {
            couponText = 'FREE';
        }
        
        const couponLink = buildCouponLinkElement(couponText, resp.url);
        couponLink.setAttribute('data-hf-coupon', itemno);
        couponLink.style.cssText = 'display:block; margin-top:8px; padding:5px; background:#f0f8f0; border-radius:4px; text-align:center; font-size:16px; font-weight:bold; color:#333; border:2px solid #4CAF50;';
        
        // Use the priceElement that was passed in (the desktop container we already found)
        if (priceElement.parentElement) {
            // Insert after the desktop price container
            priceElement.parentElement.insertBefore(couponLink, priceElement.nextSibling);
            //console.log('Coupon placed after desktop price container');
        } else {
            //console.log('No parent element found for placement');
        }
        
        //console.log('Coupon added successfully for SKU:', itemno);
    });
}

// Add these functions after your displayCoupons function

// Function to find the product card container for a price element
function findProductCard(priceElement) {
    // Walk up the DOM tree to find the product card container
    let current = priceElement;
    let depth = 0;
    const maxDepth = 10; // Prevent infinite loops
    
    while (current && current !== document.body && depth < maxDepth) {
        // Look for more specific product card selectors
        if (current.classList && (
            current.classList.contains('product-card') ||
            current.classList.contains('product-item') ||
            current.classList.contains('grid-item') ||
            current.classList.contains('catalog-item') ||
            current.getAttribute('data-testid')?.includes('product') ||
            current.getAttribute('data-testid')?.includes('item') ||
            current.getAttribute('role') === 'article' ||
            current.tagName === 'ARTICLE'
        )) {
            return current;
        }
        
        // Also check if this element contains product information
        if (current.querySelector && (
            current.querySelector('img[src*="catalog"]') ||
            current.querySelector('a[href*=".html"]') ||
            current.querySelector('[class*="title"]') ||
            current.querySelector('[class*="name"]')
        )) {
            return current;
        }
        
        current = current.parentElement;
        depth++;
    }
    
    // If we can't find a specific product card, use the closest container
    return priceElement.closest('[class*="grid"], [class*="item"], [class*="card"]') || priceElement.parentElement;
}

// Function to extract SKU from a product card
function extractSkuFromProductCard(productCard) {
    // Method 1: Look for SKU in data attributes
    const skuAttr = productCard.getAttribute('data-sku') || 
                    productCard.getAttribute('data-item') ||
                    productCard.getAttribute('data-product-id');
    if (skuAttr) {
        return skuAttr;
    }
    
    // Method 2: Look for SKU in the product card text
    const cardText = productCard.textContent || productCard.innerText;
    const skuMatch = cardText.match(/(?:SKU|Item|Product|#)\s*:?\s*(\d+)/i);
    if (skuMatch && skuMatch[1]) {
        return skuMatch[1];
    }
    
    // Method 3: Look for SKU in any links within the product card
    const links = productCard.querySelectorAll('a[href*=".html"]');
    for (const link of links) {
        const href = link.getAttribute('href');
        const urlMatch = href.match(/(\d+)\.html$/);
        if (urlMatch && urlMatch[1]) {
            return urlMatch[1];
        }
    }
    
    return null;
}

// Update the findPriceContainer function to target the main price container
function findPriceContainer(priceElement) {
    // Walk up the DOM to find the container that holds the pricing information
    let current = priceElement;
    let depth = 0;
    const maxDepth = 12;
    
    while (current && current !== document.body && depth < maxDepth) {
        // Skip mobile-specific containers
        if (current.classList && (
            current.classList.contains('mobile-bar') ||
            current.classList.contains('mobile-only') ||
            current.classList.contains('mobile-bar__') ||
            current.classList.contains('hidden') ||
            current.classList.contains('d-none')
        )) {
            current = current.parentElement;
            depth++;
            continue;
        }
        
        // Look for the main price container (this is what we want!)
        if (current.classList && (
            current.classList.contains('price__container') ||
            current.getAttribute('data-testid') === 'priceWrap'
        )) {
            return current;
        }
        
        // Look for other containers that typically hold pricing
        if (current.classList && (
            current.classList.contains('price') ||
            current.classList.contains('pricing') ||
            current.classList.contains('product-price') ||
            current.classList.contains('price-container') ||
            current.classList.contains('price-wrap') ||
            current.classList.contains('price-info') ||
            current.classList.contains('product-info') ||
            current.classList.contains('product-details') ||
            current.getAttribute('data-testid')?.includes('price') ||
            current.getAttribute('data-testid')?.includes('product')
        )) {
            return current;
        }
        
        // Also check if this element contains both price and other price-related elements
        if (current.querySelector && (
            current.querySelector('[class*="price"]') ||
            current.querySelector('[class*="Price"]') ||
            current.querySelector('s, del, [class*="strike"], [class*="original"]')
        )) {
            return current;
        }
        
        current = current.parentElement;
        depth++;
    }
    
    return null;
}

// Add this function to find a better placement location
function findBetterPlacementLocation(priceElement) {
    // Look for the main product area that's always visible
    let current = priceElement;
    let depth = 0;
    const maxDepth = 20;
    
    while (current && current !== document.body && depth < maxDepth) {
        // Look for main product containers
        if (current.classList && (
            current.classList.contains('product') ||
            current.classList.contains('product-details') ||
            current.classList.contains('product-info') ||
            current.classList.contains('main-content') ||
            current.classList.contains('content') ||
            current.classList.contains('container') ||
            current.getAttribute('data-testid')?.includes('product') ||
            current.getAttribute('role') === 'main'
        )) {
            return current;
        }
        
        current = current.parentElement;
        depth++;
    }
    
    return null;
}

// Update the findBestPriceElement function to avoid mobile elements
function findBestPriceElement(priceElements, itemno) {
    //console.log('Finding best price element from', priceElements.length, 'elements');
    
    // Filter out mobile-specific price elements
    const desktopPriceElements = Array.from(priceElements).filter(el => {
        // Skip mobile-specific elements
        if (el.classList && (
            el.classList.contains('mobile-bar__') ||
            el.classList.contains('mobile-bar') ||
            el.closest('.mobile-bar') ||
            el.closest('[class*="mobile-bar"]')
        )) {
            //console.log('Skipping mobile element:', el);
            return false;
        }
        return true;
    });
    
    //console.log('Found', desktopPriceElements.length, 'desktop price elements');
    
    // Priority order for desktop price elements
    const priorities = [
        // Main product price container
        el => el.classList.contains('price__container') || 
              el.getAttribute('data-testid') === 'priceWrap',
        
        // Main product price
        el => el.classList.contains('price__price') || 
              el.classList.contains('product-price') ||
              el.classList.contains('main-price'),
        
        // Price container that holds the main pricing
        el => el.classList.contains('price-container') ||
              el.classList.contains('price-wrap'),
        
        // Any element with "price" in class that's not mobile
        el => el.classList.contains('price') && !el.closest('[class*="mobile"]'),
        
        // Fallback: first desktop element
        el => true
    ];
    
    for (const priority of priorities) {
        for (const element of desktopPriceElements) {
            if (priority(element)) {
                //console.log('Selected desktop price element for coupon placement:', element);
                return element;
            }
        }
    }
    
    // If no priority matches, return the first desktop element
    return desktopPriceElements[0] || priceElements[0];
}

// Clear stale coupon markers on user refreshes or page navigation
function clearStaleCouponMarkersIfUserRefresh() {
    // Always clear markers when navigating to a new page (different URL)
    const currentUrl = window.location.href;
    const lastUrl = sessionStorage.getItem('lastPageUrl');
    
    if (lastUrl && lastUrl !== currentUrl) {
        // URL changed - this is navigation to a new page
        const staleMarkers = document.querySelectorAll('[data-hf-coupon]');
        if (staleMarkers.length > 0) {
            console.log('Page navigation detected, clearing', staleMarkers.length, 'stale coupon markers from previous page');
            staleMarkers.forEach(marker => marker.removeAttribute('data-hf-coupon'));
        }
        
        // Clear the processedSkus Set when navigating to a new page
        processedSkus.clear();
        console.log('Page navigation detected, cleared processedSkus Set, ready to process new page');
        
        sessionStorage.setItem('lastPageUrl', currentUrl);
        return;
    }
    
    // Check if this is a user refresh on the same page
    if (isUserRefresh()) {
        const staleMarkers = document.querySelectorAll('[data-hf-coupon]');
        if (staleMarkers.length > 0) {
            console.log('User refresh detected, clearing', staleMarkers.length, 'stale coupon markers');
            staleMarkers.forEach(marker => marker.removeAttribute('data-hf-coupon'));
        }
        
        console.log('Page refresh detected, ready to re-process page');
    } else {
        console.log('Automated refresh detected, keeping coupon markers intact');
    }
    
    // Store current URL for next comparison
    sessionStorage.setItem('lastPageUrl', currentUrl);
}

// Check if this is a user-initiated refresh
function isUserRefresh() {
    // Navigation timing API gives us detailed info about how the page was loaded
    if (performance.navigation) {
        // TYPE_RELOAD = 1 (user refresh), TYPE_NAVIGATE = 0 (normal navigation)
        return performance.navigation.type === 1;
    }
    
    // Modern browsers use PerformanceNavigationTiming
    if (performance.getEntriesByType) {
        const navigationEntries = performance.getEntriesByType('navigation');
        if (navigationEntries.length > 0) {
            const nav = navigationEntries[0];
            // Check if this was a reload
            return nav.type === 'reload';
        }
    }
    
    return false;
}

// Wait for DOM to be ready, then start checking
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        // Check if extension context is still valid before proceeding
        if (!isExtensionContextValid()) {
            console.error('Extension context invalid during initialization, stopping');
            return;
        }
        
        // Clear markers only on user refreshes
        clearStaleCouponMarkersIfUserRefresh();
        
        // Initial run
        displayCoupons();

        
        // Start keep-alive mechanism
        startKeepAlive();
        
        // Run again after a short delay to catch any late-loading elements
        setTimeout(function() {
            if (isExtensionContextValid()) {
                displayCoupons();
            }
        }, 500);
    });
} else {
    // Page already loaded, run immediately
    // Check if extension context is still valid before proceeding
    if (!isExtensionContextValid()) {
        console.error('Extension context invalid during initialization, stopping');
    }
    
    clearStaleCouponMarkersIfUserRefresh();
    displayCoupons();
    startKeepAlive();
    
    // Run again after a short delay to catch any late-loading elements
    setTimeout(function() {
        if (isExtensionContextValid()) {
            displayCoupons();
        }
    }, 500);
}

// Also watch for URL changes (SPA navigation)
let currentUrl = window.location.href;
setInterval(() => {
    if (window.location.href !== currentUrl) {
        //console.log('URL changed from', currentUrl, 'to', window.location.href);
        currentUrl = window.location.href;
        processedSkus.clear();
        
        // Wait for new content to load, then process
        setTimeout(displayCoupons, 1000);
    }
}, 1000);

// Add this to clean up when the page is unloaded
window.addEventListener('beforeunload', function() {
    stopKeepAlive();
    //console.log('Extension cleaning up before page unload');
});

// Also clean up on page visibility change (tab switching)
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        //console.log('Page hidden, pausing extension activity');
    } else {
        //console.log('Page visible, resuming extension activity');
        // Re-run displayCoupons when page becomes visible again
        if (isExtensionContextValid()) {
            displayCoupons();
        }
    }
});
