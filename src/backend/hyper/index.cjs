const HyperSwarm = require("hyperswarm");
const sanitize = require("sanitize-html");

let connections = [];

let swarm;
let topic;
let discovery;

const createSwarm = async (sender, secret) => {

    console.log("Starting a swarm on: ", secret);
    swarm = new HyperSwarm();

    topic = Buffer.alloc(32).fill(secret);
    discovery = swarm.join(topic, { server: true, client: true });
    console.log("Looking for peers on: " + topic);
    await discovery.flushed();

    sender("connected");

    swarm.on("error", e => console.log("SWARM ERROR: ", e));
    swarm.on("connection", async (connection, information) => {

      console.log("Peer connected");
      sender("hyper-peer", true);

      connections.push(connection);

      connection.on("error", e => console.log("CONNECTION ERROR: ", e));
      connection.on("data", async data => {

        data = JSON.parse(data);
        console.log(data);

        if (data.type === "disconnect") {
          console.log("Peet disconnected");
          connection.end();
          connection.destroy();
          sender("hyper-peer", false);
        }

        if (data.type === "message") {
          const { type, id, time, nickname, message } = data;
          data = {
            type: sanitize(type),
            id: sanitize(id),
            time: sanitize(time),
            nickname: sanitize(nickname),
            message: sanitize(message)
          };
          sender("hyper-message", data);
        }

      });
    })
    ;

    process.once("SIGINT", function() {
      swarm.on("close", function() {
        process.exit();
      });
      swarm.destroy();
      setTimeout(() => process.exit(), 2000);
    });
  }
;

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
  console.log("sending", data);
  connections.forEach(connection => {
    connection.write(JSON.stringify(data));
  });
};


module.exports = { createSwarm, destroySwarm, sendMessage };