/**
 * Mapa da entrega (ponto 8b) em Leaflet + OpenStreetMap dentro de uma WebView.
 * Escolhido no lugar do react-native-maps porque não exige chave do Google no APK.
 * A página é montada uma vez; cada posição nova entra por injectJavaScript (mapUpdateScript),
 * então o mapa não recarrega nem perde o zoom que o cliente escolheu.
 */

export interface MapPoint {
  latitude: number;
  longitude: number;
}

export interface MapState {
  /** Endereço do pedido; null em pedidos antigos salvos no aparelho sem coordenadas. */
  destination: MapPoint | null;
  courier: (MapPoint & { accuracy: number; fresh: boolean }) | null;
}

export const validPoint = (p: Partial<MapPoint> | null | undefined): p is MapPoint =>
  !!p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude)
  && Math.abs(p.latitude!) <= 90 && Math.abs(p.longitude!) <= 180;

/** Distância em linha reta (Haversine), em metros. */
export function straightDistance(a: MapPoint, b: MapPoint): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** 350 → "350 m"; 1234 → "1,2 km" */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${(meters / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
}

/** Chama window.updateMap dentro da WebView. JSON.stringify impede injeção de código. */
export function mapUpdateScript(state: MapState): string {
  return `window.updateMap && window.updateMap(${JSON.stringify(state)}); true;`;
}

/** Ação vinda do botão "Centralizar" do app. */
export const MAP_RECENTER_SCRIPT = 'window.recenter && window.recenter(); true;';

// Leaflet 1.9.4 com SRI. Tiles da CARTO (dados do OpenStreetMap): o servidor padrão do OSM
// bloqueia pedidos sem Referer, que é o caso de uma WebView com HTML local.
export const MAP_HTML = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
  integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
  integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<style>
  html, body, #map { margin: 0; height: 100%; background: #F5F5F4; }
  .pin { display: flex; align-items: center; justify-content: center; width: 34px; height: 34px;
    border-radius: 17px; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.35); font-size: 18px; }
  .home { background: #1C1917; }
  .moto { background: #C2410C; }
  .moto.stale { background: #78716C; }
</style>
</head><body>
<div id="map"></div>
<script>
  var send = function (msg) { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(msg)); };
  if (!window.L) { send({ type: 'error' }); }
  else {
    var map = L.map('map', { zoomControl: false, attributionControl: true }).setView([-23.0858, -47.2025], 14);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19, subdomains: 'abcd',
      attribution: '&copy; OpenStreetMap &copy; CARTO'
    }).addTo(map);
    var icon = function (cls, emoji) {
      return L.divIcon({ className: '', html: '<div class="pin ' + cls + '">' + emoji + '</div>', iconSize: [34, 34], iconAnchor: [17, 17] });
    };
    var home = null, moto = null, circle = null, userMoved = false, last = null;
    // Só o toque do cliente conta: fitBounds/setView também disparam eventos de zoom.
    var touched = function () { userMoved = true; };
    map.getContainer().addEventListener('touchstart', touched, { passive: true });
    map.getContainer().addEventListener('mousedown', touched);
    function frame() {
      var pts = [];
      if (last && last.destination) pts.push([last.destination.latitude, last.destination.longitude]);
      if (last && last.courier) pts.push([last.courier.latitude, last.courier.longitude]);
      if (pts.length === 1) map.setView(pts[0], 16);
      else if (pts.length > 1) map.fitBounds(pts, { padding: [48, 48], maxZoom: 17 });
    }
    window.recenter = function () { userMoved = false; frame(); };
    window.updateMap = function (state) {
      last = state;
      if (state.destination) {
        var d = [state.destination.latitude, state.destination.longitude];
        if (!home) home = L.marker(d, { icon: icon('home', '🏠'), zIndexOffset: 0 }).addTo(map);
        else home.setLatLng(d);
      }
      if (state.courier) {
        var c = [state.courier.latitude, state.courier.longitude];
        var cls = state.courier.fresh ? 'moto' : 'moto stale';
        if (!moto) moto = L.marker(c, { icon: icon(cls, '🛵'), zIndexOffset: 1000 }).addTo(map);
        else { moto.setLatLng(c); moto.setIcon(icon(cls, '🛵')); }
        if (!circle) circle = L.circle(c, { radius: state.courier.accuracy, color: '#C2410C', weight: 1, fillOpacity: 0.12 }).addTo(map);
        else { circle.setLatLng(c); circle.setRadius(state.courier.accuracy); }
      }
      // Enquadra sozinho até o cliente mexer no mapa; depois só pelo botão "Centralizar".
      if (!userMoved) frame();
    };
    send({ type: 'ready' });
  }
</script>
</body></html>`;
