/**
 * Runs before the app's own code. If the person chose a time zone (kept in the `aven-tz` cookie), every date and
 * time the browser formats uses it unless the caller asks for a specific zone. That covers all screens at once,
 * including `Intl.DateTimeFormat().resolvedOptions().timeZone`, which the calendar uses as its default.
 * It is plain ES5 in a string so it can be inlined in the page and also run in tests.
 */
export const timeZoneScript = `(function(){
  var match = document.cookie.match(/(?:^|; )aven-tz=([^;]+)/); if (!match) return;
  var zone = decodeURIComponent(match[1]);
  try { new Intl.DateTimeFormat('en', { timeZone: zone }); } catch (error) { return; }
  var Original = Intl.DateTimeFormat;
  function Patched(locales, options) { return new Original(locales, Object.assign({ timeZone: zone }, options)); }
  Patched.prototype = Original.prototype; Patched.supportedLocalesOf = Original.supportedLocalesOf;
  Patched.deviceZone = new Original().resolvedOptions().timeZone;
  Intl.DateTimeFormat = Patched;
  ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString'].forEach(function (name) {
    var original = Date.prototype[name];
    Date.prototype[name] = function (locales, options) { return original.call(this, locales, Object.assign({ timeZone: zone }, options)); };
  });
})();`;

export const timeZoneCookie = 'aven-tz';
/** Cookie text that remembers (or, with null, forgets) the chosen zone for a year. */
export const timeZoneCookieValue = (zone: string | null) => (zone ? `${timeZoneCookie}=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax` : `${timeZoneCookie}=; path=/; max-age=0; samesite=lax`);
