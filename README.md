# HashiClient

Terraform script to create compute instances all running consul and nomad clients

Build the packer image

```
cd packer
packer build packer.json -var 'account_file=path/to/account.json'
```

Utilize the resource 
```
const hashiClient = new HashiClient("Client", { 
    // Mandatory properties (you must set these yourself)
    imageUrl: "gcp image self link" 
    machineType: "g1-small"
    networkLink: "networkSelfLink"
    targetSize: 2

    // Optional properties (below are the default values)
    networkTier: "STANDARD",
    description: "Created by Pulumi",
    labels: {},
    serviceAccountName: "c9s-bot",
    tags: ["allow-icmp"],
});
