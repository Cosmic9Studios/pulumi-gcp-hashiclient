import * as fs from "fs";
import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as os from "os";

interface IHashiClientOptions {
    imageUrl: string, 
    machineType: string, 
    networkLink: string | pulumi.Output<string>,
    targetSize: number,
    networkTier?: string,
    description?: string,
    labels?: pulumi.Input<{[key: string]: pulumi.Input<string>}>,
    serviceAccountName?: string,
    tags?: Array<string>,
    zone?: string,
    domain?: string
}

export default class HashiClient extends pulumi.ComponentResource {
    public regionalAddress: pulumi.Output<string>;
    public globalAddress: pulumi.Output<string>;

    constructor(name: string, options: IHashiClientOptions) {
        super("c9s:component:HashiClient", name);
        options = { 
            networkTier: "STANDARD",
            description: "Created by Pulumi",
            labels: {},
            serviceAccountName: "c9s-bot",
            tags: ["allow-icmp"], 
            zone: "us-central1-a", 
            domain: "mydomain.com",
            ...options 
        };

        const instanceTemplate = this.instanceTemplate(options);
        const targetPool = new gcp.compute.TargetPool("client-pool", {}, { parent: this });
        const instanceGroupManager = this.instanceGroupManager(instanceTemplate.selfLink, targetPool.selfLink, options.targetSize);

        const globalAddress = new gcp.compute.GlobalAddress("client-global-address", {}, { parent: this });
        const sslCertificate = new gcp.compute.MangedSslCertificate("cert", {
            managed: {
                domains: options.domain,
            },
        }, { parent: this });

        const ipAddress = new gcp.compute.Address("client-ip-address", {
            networkTier: options.networkTier,
        }, { parent: this });

        const healthCheck = new gcp.compute.HttpHealthCheck("client-health-check", {
            port: 9999,
            requestPath: "/health",
        }, { parent: this });

        const backendService = new gcp.compute.BackendService("client-backend", {
            backends: [{
                group: instanceGroupManager.instanceGroup,
            }],
            healthChecks: healthCheck.selfLink,
            portName: "fabio",
            protocol: "HTTP",
        }, { parent: this });

        const urlMap = new gcp.compute.URLMap("client-url-map", {
            defaultService: backendService.selfLink
        }, { parent: this });

        const targetHttpsProxy = new gcp.compute.TargetHttpsProxy("client", {
            sslCertificates: [sslCertificate.selfLink],
            urlMap: urlMap.selfLink,
        }, { parent: this});
        
        const globalForwardingRule = new gcp.compute.GlobalForwardingRule("client-region", {
            ipAddress: globalAddress.address,
            portRange: "443",
            target: targetHttpsProxy.selfLink,
        }, { parent: this });
        
        const forwardingRule = new gcp.compute.ForwardingRule("client-http-forwarding-rule", {
            ipAddress: ipAddress.address,
            networkTier: options.networkTier,
            portRange: "4646",
            target: targetPool.selfLink,
        }, { parent: this });

        this.regionalAddress = ipAddress.address;
        this.globalAddress = globalAddress.address;   
        
        this.registerOutputs({
            regionalAddress: this.regionalAddress,
            globalAddress: this.globalAddress
        });
    }

    instanceTemplate(options: IHashiClientOptions): gcp.compute.InstanceTemplate {
        return new gcp.compute.InstanceTemplate("client", {
            disks: [{
                autoDelete: true,
                boot: true,
                sourceImage: options.imageUrl,
            }],
            instanceDescription: options.description,
            labels: options.labels,
            machineType: options.machineType,
            metadataStartupScript: fs.readFileSync(`${__dirname}/files/startup.sh`, "utf-8"),
            networkInterfaces: [{
                network: options.networkLink,
            }],
            serviceAccount: {
                email: `${options.serviceAccountName}@assetstore.iam.gserviceaccount.com`,
                scopes: ["compute-ro"],
            },
            tags: options.tags,
        }, { parent: this }); 
    };


    instanceGroupManager(instanceTemplateLink: string | pulumi.Output<string>, targetPoolLink: string | pulumi.Output<string>, targetSize: number) { 
        return new gcp.compute.InstanceGroupManager("client-group-manager", {
            baseInstanceName: "client",
            versions: [{
                instanceTemplate: instanceTemplateLink,
                name: "live"
            }],
            waitForInstances: true,
            namedPorts: [{
                name: "fabio",
                port: 9999,
            }],
            targetPools: [targetPoolLink],
            targetSize: targetSize,
        }, { parent: this });
    }
}