<script>
  import { onMount } from 'svelte';
  import { node } from '$lib/stores/node.js';

  export let hash;

  onMount(async () => {
    if (!$node.selectedNode) return;

    let endpoint;
    if ($node.selectedNode.ssl) {
      endpoint = `https://${$node.selectedNode.url}/api/json_rpc`;
    } else {
      endpoint = `http://${$node.selectedNode.url}/api/json_rpc`;
    }

    await getTransaction(hash);
  });

  async function getTransaction(hash) {
    const response = await fetch(endpoint, {
      method: 'POST',
      cache: 'no-cache',
      redirect: 'follow',
      referrerPolicy: 'no-referrer',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'getTransaction',
        method: 'f_transaction_json',
        params: {
          hash: hash,
        },
      }),
    });
    let data = await response.json();
    console.log(data);
  }
</script>
