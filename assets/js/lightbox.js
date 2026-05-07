// ======================
// Lightbox System
// ======================
(function () {
    var lightbox = document.getElementById('lightbox');
    var lightboxImg = document.getElementById('lightboxImg');
    var lightboxCaption = document.getElementById('lightboxCaption');
    var lightboxCounter = document.getElementById('lightboxCounter');
    var closeBtn = document.getElementById('lightboxClose');
    var prevBtn = document.getElementById('lightboxPrev');
    var nextBtn = document.getElementById('lightboxNext');

    var currentIndex = 0;
    var currentImages = [];
    var previousFocus = null;

    // Touch handling
    var touchStartX = 0;
    var touchEndX = 0;
    var touchStartY = 0;
    var touchEndY = 0;

    // Expose to global scope for inline onclick handlers
    window.openLightbox = function (index, gallerySlug) {
        // Gather all gallery items from the page
        var items = document.querySelectorAll('.gallery-item');
        currentImages = [];

        items.forEach(function (item) {
            var img = item.querySelector('img');
            var caption = item.querySelector('.gallery-caption');
            if (img) {
                currentImages.push({
                    src: img.src,
                    alt: img.alt,
                    caption: caption ? caption.textContent : ''
                });
            }
        });

        if (currentImages.length === 0) return;

        previousFocus = document.activeElement;
        currentIndex = index;
        showImage();
        lightbox.classList.add('active');
        document.body.style.overflow = 'hidden';
        closeBtn.focus();
    };

    function showImage() {
        if (!currentImages[currentIndex]) return;
        var img = currentImages[currentIndex];
        lightboxImg.src = img.src;
        lightboxImg.alt = img.alt;
        lightboxCaption.textContent = img.caption;
        lightboxCounter.textContent = (currentIndex + 1) + ' / ' + currentImages.length;

        // Hide prev/next at boundaries (or wrap)
        prevBtn.style.visibility = currentIndex === 0 ? 'hidden' : 'visible';
        nextBtn.style.visibility = currentIndex === currentImages.length - 1 ? 'hidden' : 'visible';
    }

    function closeLightbox() {
        lightbox.classList.remove('active');
        document.body.style.overflow = '';
        lightboxImg.src = '';
        if (previousFocus) {
            previousFocus.focus();
        }
    }

    function prevImage() {
        if (currentIndex > 0) {
            currentIndex--;
            showImage();
        }
    }

    function nextImage() {
        if (currentIndex < currentImages.length - 1) {
            currentIndex++;
            showImage();
        }
    }

    // Event Listeners
    if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
    if (prevBtn) prevBtn.addEventListener('click', prevImage);
    if (nextBtn) nextBtn.addEventListener('click', nextImage);

    // Click outside image to close
    if (lightbox) {
        lightbox.addEventListener('click', function (e) {
            if (e.target === lightbox || e.target.classList.contains('lightbox-content')) {
                closeLightbox();
            }
        });
    }

    // Keyboard navigation
    document.addEventListener('keydown', function (e) {
        if (!lightbox || !lightbox.classList.contains('active')) return;

        switch (e.key) {
            case 'Escape':
                closeLightbox();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                prevImage();
                break;
            case 'ArrowRight':
                e.preventDefault();
                nextImage();
                break;
            case 'Tab':
                // Focus trap within lightbox
                e.preventDefault();
                if (e.shiftKey) {
                    prevBtn.focus();
                } else {
                    nextBtn.focus();
                }
                break;
        }
    });

    // Touch/swipe support
    if (lightbox) {
        lightbox.addEventListener('touchstart', function (e) {
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        }, { passive: true });

        lightbox.addEventListener('touchend', function (e) {
            touchEndX = e.changedTouches[0].screenX;
            touchEndY = e.changedTouches[0].screenY;
            handleSwipe();
        }, { passive: true });
    }

    function handleSwipe() {
        var diffX = touchStartX - touchEndX;
        var diffY = touchStartY - touchEndY;
        var minSwipe = 50;

        // Only handle horizontal swipes (ignore vertical scrolling)
        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > minSwipe) {
            if (diffX > 0) {
                nextImage(); // Swipe left = next
            } else {
                prevImage(); // Swipe right = prev
            }
        }
    }
})();
