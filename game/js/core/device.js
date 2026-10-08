// ===================================================================
// Device profile: the one place that decides what the game runs on.
// Loaded first in <head> (play.html, index.html) so the classes below are
// on <html> before the first paint.
//
//   PPDevice.kind   'phone' | 'tablet' | 'desktop'  (fixed for the session)
//   PPDevice.mobile  phone or tablet: touch-first layout and the mobile
//                    quality ladder (html.pp-mobile, css/mobile.css)
//   PPDevice.touch   the primary pointer right now is a finger (live: a
//                    tablet with a trackpad, or a touch laptop, can switch)
//
// Classes on <html>: pp-phone / pp-tablet / pp-desktop, pp-mobile for
// phones and tablets, and pp-input-touch / pp-input-mouse for the input.
// ===================================================================
(function () {
    const nav = navigator;
    const ua = nav.userAgent || '';
    const mq = (q) => { try { return matchMedia(q); } catch (e) { return { matches: false }; } };
    const touchPoints = nav.maxTouchPoints || 0;
    const coarse = mq('(pointer: coarse)');
    const noHover = mq('(hover: none)').matches;
    // Short side of the screen in CSS px, whichever way the device is held.
    const shortSide = Math.min(screen.width || 9999, screen.height || 9999);

    // iPadOS 13+ Safari (and iPhones on "Request Desktop Website") claim to
    // be a Mac; a Mac has no touch points.
    const fakeMac = /Macintosh/.test(ua) && touchPoints > 1;
    const ipad = /iPad/.test(ua) || (fakeMac && shortSide >= 600);
    const androidTablet = /Android/.test(ua) && !/Mobile/.test(ua);
    const uaPhone = !!nav.userAgentData?.mobile || /iPhone|iPod|Mobile/.test(ua) || (fakeMac && shortSide < 600);
    // Browsers that hide the device (e.g. Android "desktop site"): a finger
    // as the only pointer and no hover means a handheld.
    const handheld = coarse.matches && noHover;

    let kind = 'desktop';
    if (ipad || androidTablet) kind = 'tablet';
    else if (uaPhone) kind = 'phone';
    else if (handheld) kind = shortSide < 600 ? 'phone' : 'tablet';

    const root = document.documentElement;
    const device = {
        kind,
        phone: kind === 'phone',
        tablet: kind === 'tablet',
        desktop: kind === 'desktop',
        mobile: kind !== 'desktop',
        touch: false,
        hasTouch: touchPoints > 0 || 'ontouchstart' in window,
        _listeners: [],
        onInputChange(fn) { this._listeners.push(fn); },
        // Text for a control: phones and tablets get the touch wording.
        label(desktopText, touchText) { return this.touch ? touchText : desktopText; }
    };

    root.classList.add('pp-' + kind);
    if (device.mobile) root.classList.add('pp-mobile');

    const syncInput = () => {
        // Phones and tablets are touch-first even with a keyboard attached;
        // on a PC, follow the primary pointer.
        const touch = device.mobile || coarse.matches;
        const changed = touch !== device.touch;
        device.touch = touch;
        root.classList.toggle('pp-input-touch', touch);
        root.classList.toggle('pp-input-mouse', !touch);
        if (changed) device._listeners.forEach((fn) => { try { fn(touch); } catch (e) { console.warn(e); } });
    };
    syncInput();
    coarse.addEventListener?.('change', syncInput);

    window.PPDevice = device;
})();
