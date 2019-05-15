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
    sshUser?: string,
    publicKeyPath?: string,
    description?: string,
    labels?: pulumi.Input<{[key: string]: pulumi.Input<string>}>,
    serviceAccountName?: string,
    tags?: Array<string>,
    zone?: string,
}

export default class HashiClient extends pulumi.ComponentResource {
    public address: pulumi.Output<string>;

    constructor(name: string, options: IHashiClientOptions) {
        super("c9s:component:HashiClient", name);
        options = { 
            networkTier: "STANDARD",
            sshUser: "c9s",
            publicKeyPath: `${os.homedir()}/.ssh/id_rsa.pub`,
            description: "Created by Pulumi",
            labels: {},
            serviceAccountName: "c9s-bot",
            tags: ["allow-icmp"], 
            zone: "us-central1-a", 
            ...options 
        };

        const instanceTemplate = this.instanceTemplate(options);
        if (options.targetSize === 1) {
            const instance = new gcp.compute.InstanceFromTemplate("client", {
                sourceInstanceTemplate: instanceTemplate.selfLink,
                zone: options.zone,
            }, { parent: this });

            this.address = instance.networkInterfaces[0].accessConfigs[0].natIp;  
        }
        else {
            const targetPool = new gcp.compute.TargetPool("client-pool", {}, { parent: this });
            const instanceGroupManager = this.instanceGroupManager(instanceTemplate.selfLink, targetPool.selfLink, options.targetSize);
            const globalAddress = new gcp.compute.GlobalAddress("client-global-address", {}, { parent: this });
            const sslCertificate = new gcp.compute.MangedSslCertificate(`c9s-cert`, {
                managed: {
                    domains: "cosmic9studios.com",
                },
            }, { parent: this });

            const ipAddress = new gcp.compute.Address("client-ip-address", {
                networkTier: options.networkTier,
            }, { parent: this });

            const healthCheck = new gcp.compute.HttpHealthCheck(`client-health-check`, {
                port: 9999,
                requestPath: "/health",
            }, { parent: this });

            const backendService = new gcp.compute.BackendService(`client-backend`, {
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

            const targetHttpsProxy = new gcp.compute.TargetHttpsProxy(`client`, {
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

            this.address = globalAddress.address;
        }       
        
        this.registerOutputs({
            address: this.address
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
            metadata: {
                sshKeys: `${options.sshUser}:${fs.readFileSync(options.publicKeyPath || "", "utf-8")}`,
            },
            metadataStartupScript: fs.readFileSync(`${__dirname}/startup.sh`, "utf-8"),
            networkInterfaces: [{
                accessConfigs: [{
                    natIp: "",
                    networkTier: options.networkTier,
                }],
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
            namedPorts: [{
                name: "fabio",
                port: 9999,
            }],
            targetPools: [targetPoolLink],
            targetSize: targetSize,
        }, { parent: this });
    }
}