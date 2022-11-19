const HyperSwarm = require("hyperswarm");

let connections = [];

let swarm;
let topic;
let discovery;


const createSwarm = async (sender, secret) => {

  console.log("Starting a swarm on: ", secret);
  swarm = new HyperSwarm();

  sender("connected");

  swarm.on("connection", (connection, information) => {

    console.log("Peer connected");
    sender("peer-connected");
    connections.push(connection);

    connection.on("data", async data => {

      data = JSON.parse(data);
      console.log(data);

      if (data.type === "disconnect") {
        console.log("Peet disconnected");
        connection.end();
        connection.destroy();
        sender("peer-disconnected");
      }

      if (data.type === "message") {
        console.log(data.data);
        sender("message", data);
      }

    });
  });

  process.once("SIGINT", function() {
    swarm.on("close", function() {
      process.exit();
    });
    swarm.destroy();
    setTimeout(() => process.exit(), 2000);
  });

  topic = Buffer.alloc(32).fill(secret);
  discovery = swarm.join(topic, { server: true, client: true });
  console.log('Looking for peers on: ' + topic);
  await discovery.flushed();
};

const destroySwarm = async (sender) => {
  //Send disconnect to each peer
  connections.forEach(connection => {
    connection.write(JSON.stringify({ type: "disconnect" }));
  });

  sender("disconnected");

  //Kill my connection
  console.log("Killing swarm");
  await swarm.leave(topic);
  await discovery.destroy();
  await swarm.destroy();
  console.log("Swarm killed");
};

const sendMessage = (data) => {
  console.log('sending', data);
  connections.forEach(connection => {
    connection.write(JSON.stringify(data));
  });
};


module.exports = { createSwarm, destroySwarm, sendMessage };