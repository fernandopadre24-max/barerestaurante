const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');

const routes = require('./routes');

const app = express();
app.use((req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log(new Date().toISOString() + '  ' + ip + '  ' + req.method + ' ' + req.originalUrl);
  next();
});
app.use(express.json());
app.use('/api', routes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

const dist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  console.log('==========================================================');
  console.log(' BARRACA - Gestão de Restaurante/Bar');
  console.log('==========================================================');
  console.log(` Servidor rodando na porta ${PORT}`);
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(` Acesse no celular (mesma rede Wi-Fi): http://${net.address}:${PORT}`);
      }
    }
  }
  console.log(' Acesse neste PC: http://localhost:3000');
  console.log('----------------------------------------------------------');
  console.log(' Em modo desenvolvimento:  npm run dev  (tela em :5173)');
  console.log(' Para produção (build):     npm run build && npm start');
  console.log(' Acesso inicial:  ADM código 1 - PIN 1234 | Garçom código 2 - PIN 1234');
  console.log('----------------------------------------------------------');
});