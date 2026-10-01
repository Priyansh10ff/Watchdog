const env = require('./src/config/env');
const connectDB = require('./src/config/db');
const app = require('./src/app');

async function start() {
  await connectDB();
  app.listen(env.port, () => {
    console.log(`Server running on port ${env.port}`);
  });
}

start();