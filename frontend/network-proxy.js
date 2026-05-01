const http = require('http');
const httpProxy = require('http-proxy');

const proxy = httpProxy.createProxyServer({
  target: 'http://localhost:3000',
  ws: true
});

const server = http.createServer((req, res) => {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  proxy.web(req, res);
});

server.on('upgrade', (req, socket, head) => {
  proxy.ws(req, socket, head);
});

server.listen(3001, '0.0.0.0', () => {
  console.log('Network proxy running on http://0.0.0.0:3001');
  console.log('Proxying to http://localhost:3000');
});
