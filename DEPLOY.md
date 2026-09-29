# Cómo poner Hyperpad en marcha (Robinhood Chain + Railway)

Hyperpad tiene tres piezas:

| Pieza | Dónde vive | Qué hace |
| --- | --- | --- |
| Contrato `HyperpadLaunchpad` | Robinhood Chain | Crea las monedas, ejecuta compras y ventas en la curva y reparte el 1% de comisión (30% creador, 50% reels, 20% Hyperpad). |
| Servidor (`server/`) | Railway + Postgres | Lee los eventos del contrato, guarda monedas y operaciones, calcula el presupuesto de reels en USD, sirve la API y la web. |
| Web (`index.html`, `main.js`, `style.css`) | La sirve el servidor | Si el servidor responde, funciona en **modo en vivo**. Si no, en **modo demo**. |

Empieza siempre en **testnet**. Ahí el ETH no tiene valor y puedes probarlo todo sin riesgo.

## 1. Conseguir ETH de prueba

1. Crea una wallet nueva solo para desplegar (por ejemplo, una cuenta nueva en MetaMask). No uses la wallet donde guardas dinero.
2. Pide ETH de prueba en el faucet oficial: https://faucet.testnet.chain.robinhood.com
3. Exporta la clave privada de esa cuenta. Solo la usarás en tu ordenador, en el paso siguiente. **Nunca la subas a GitHub ni la pegues en un chat.**

## 2. Desplegar el contrato

Necesitas Node.js 20 o superior en tu ordenador.

```sh
cd contracts
npm install
npx hardhat test                  # 13 pruebas, deben pasar todas
DEPLOYER_PRIVATE_KEY=0xTU_CLAVE npm run deploy:testnet
```

Al terminar verás la dirección del contrato y el bloque de despliegue. También se guardan en `contracts/deployments/robinhoodTestnet.json`. Apúntalos.

Opcional, con estas variables al desplegar:
- `OWNER`: quién puede pausar y retirar la parte de Hyperpad. Lo ideal es una multisig (por ejemplo, Safe).
- `REEL_OPERATOR`: la wallet que retira el presupuesto de reels para pagar los videos.
- `VIRTUAL_ETH` y `VIRTUAL_TOKENS`: la forma de la curva. Con los valores por defecto (1,5 ETH y 1.073 millones), los 800 millones de tokens de la curva se venden por unos 4,4 ETH.

## 3. Crear el proyecto en Railway

1. En https://railway.com crea un proyecto: **New Project → Deploy from GitHub repo → arturoz55/4**.
2. En **Settings → Source**, elige la rama `claude/loving-sagan-9v9pln`, o fusiónala antes en `main` y elige `main`. Railway volverá a desplegar solo cada vez que esa rama cambie.
3. Añade una base de datos: **New → Database → PostgreSQL**.
4. En tu servicio web, abre **Variables** y añade (tienes la lista completa en `.env.example`):

| Variable | Valor |
| --- | --- |
| `CHAIN` | `testnet` |
| `LAUNCHPAD_ADDRESS` | la dirección del paso 2 |
| `START_BLOCK` | el bloque del paso 2 |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `SESSION_SECRET` | una cadena larga y aleatoria |
| `PUBLIC_URL` | la URL pública del servicio (paso 5) |
| `NODE_ENV` | `production` |
| `VIDEO_PROVIDER` | `none` hasta que conectes un servicio de video (paso 6) |

Recomendado: pide una clave gratuita en Alchemy y pon `RPC_URL=https://robinhood-testnet.g.alchemy.com/v2/TU_CLAVE`. El RPC público tiene límite de peticiones.

5. En **Settings → Networking**, pulsa **Generate Domain** o añade tu dominio propio. Copia esa URL en `PUBLIC_URL` (sin `/` al final).
6. Comprueba que funciona: abre `TU_URL/api/health` (debe responder `{"ok":true}`) y luego `TU_URL`. Arriba debe decir "Live on Robinhood Chain Testnet".

### Si la web publicada no muestra los cambios

- El servidor añade una huella a `style.css` y `main.js` en cada despliegue (`main.js?v=…`), así que el navegador siempre descarga la versión nueva.
- Si tu web está en otro hosting (no en Railway), ese hosting debe desplegar desde esta rama. Si subiste los archivos a mano, tendrás que volver a subirlos.
- Para salir de dudas, recarga sin caché: Ctrl+Shift+R (Windows) o Cmd+Shift+R (Mac).

## 4. Probar todo en testnet

1. Abre la web, conecta MetaMask (o Coinbase Wallet o Rabby) y acepta añadir la red Robinhood Chain Testnet.
2. **Launch a coin**: rellena el formulario y confirma en tu wallet.
3. Compra y vende desde la tarjeta de la moneda.
4. En el panel, **Payouts → Withdraw** reclama tus comisiones de creador.
5. **Log in** te pide firmar un mensaje (no cuesta gas). Después puedes cambiar los ajustes de tu moneda.

## 5. Conectar un servicio de video (reels reales)

Cada $25 de comisiones de reels de una moneda crea un trabajo de reel en la base de datos. Con `VIDEO_PROVIDER=webhook`, el servidor lo envía a tu renderizador:

- `VIDEO_WEBHOOK_URL`: la URL que recibe los trabajos. Puede ser tu propio servicio o un flujo de n8n, Make o Zapier que llame a la IA de video que elijas.
- `VIDEO_WEBHOOK_SECRET`: un secreto compartido.

Cada trabajo llega como `POST` con JSON: `reelId`, `n`, `format`, `host`, `coin` (nombre, ticker, frase, imagen) y `callbackUrl`. La cabecera `x-hyperpad-signature` es un HMAC-SHA256 del cuerpo con tu secreto.

Cuando el video esté listo, tu renderizador llama a `callbackUrl` con `{"status":"posted","videoUrl":"https://…"}` (o `{"status":"failed","error":"…"}`), firmado igual. El reel aparece en la web y el reproductor muestra el video real.

Para pagar los videos, la wallet `REEL_OPERATOR` puede retirar el presupuesto de reels de cada moneda con `withdrawReelFees`.

## 6. Propinas en ZEC

- Las propinas van directamente a la dirección Zcash que pone el creador al lanzar. Hyperpad nunca toca esos fondos.
- Hoy la web registra cada propina como **"reportada, sin verificar"**. Los memos nunca se guardan en el servidor.
- Para verificarlas en la cadena de Zcash hace falta un servidor `lightwalletd` y la *viewing key* de cada creador. Es el siguiente paso si quieres que las propinas cuenten para el bote de reels.

## 7. Pasar a mainnet (dinero real)

Antes de hacerlo:

1. **Auditoría de seguridad** del contrato por una empresa especializada. Este código tiene pruebas, pero no ha sido auditado.
2. **Asesoría legal** sobre lanzar tokens y repartir comisiones en los países donde vas a operar.
3. Usa una **multisig** como `OWNER`.

Después, despliega con `npm run deploy:mainnet` y cambia en Railway `CHAIN=mainnet` y `LAUNCHPAD_ADDRESS` y `START_BLOCK` por los nuevos valores. Con el nuevo contrato, la base de datos empieza vacía.

## Probar en local

```sh
cd contracts && npx hardhat node                       # terminal 1: cadena local
cd contracts && npx hardhat run scripts/deploy-local.js --network localhost
CHAIN=local LAUNCHPAD_ADDRESS=0x... START_BLOCK=1 VIDEO_PROVIDER=mock npm start   # terminal 2
API=http://localhost:3000 LAUNCHPAD=0x... node server/test/integration.mjs         # 16 comprobaciones
```

Sin `DATABASE_URL`, el servidor usa PGlite (Postgres en memoria), así que no hace falta instalar nada más.
