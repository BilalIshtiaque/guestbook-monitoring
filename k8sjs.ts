// Copyright 2016-2025, Pulumi Corporation.  All rights reserved.

import * as k8s from "@pulumi/kubernetes";
import * as k8stypes from "@pulumi/kubernetes/types/input";
import * as pulumi from "@pulumi/pulumi";

/**
 * ServiceDeployment is an example abstraction that uses a class to fold together the common pattern of a
 * Kubernetes Deployment and its associated Service object.
 */
export class ServiceDeployment extends pulumi.ComponentResource {
    public readonly deployment: k8s.apps.v1.Deployment;
    public readonly service: k8s.core.v1.Service;
    public readonly metricsService?: k8s.core.v1.Service;
    public readonly serviceMonitor?: k8s.apiextensions.CustomResource;
    public readonly ipAddress?: pulumi.Output<string>;

    constructor(name: string, args: ServiceDeploymentArgs, opts?: pulumi.ComponentResourceOptions) {
        super("k8sjs:service:ServiceDeployment", name, {}, opts);

        const labels = { app: name };
        const container: k8stypes.core.v1.Container = {
            name,
            image: args.image,
            resources: args.resources || { requests: { cpu: "100m", memory: "100Mi" } },
            env: [{ name: "GET_HOSTS_FROM", value: "dns" }],
            ports: args.ports && args.ports.map(p => ({ containerPort: p })),
        };
        const containers: k8stypes.core.v1.Container[] = [container];
        if (args.metrics) {
            containers.push({
                name: "metrics-exporter",
                image: args.metrics.image,
                args: args.metrics.args,
                resources: { requests: { cpu: "10m", memory: "32Mi" } },
                ports: [{ name: "metrics", containerPort: args.metrics.port }],
            });
        }
        this.deployment = new k8s.apps.v1.Deployment(name, {
            spec: {
                selector: { matchLabels: labels },
                replicas: args.replicas || 1,
                template: {
                    metadata: { labels: labels },
                    spec: { containers },
                },
            },
        }, { parent: this });


        this.service = new k8s.core.v1.Service(name, {
            metadata: {
                name: name,
                labels: labels,
            },
            spec: {
                ports: args.ports && args.ports.map(p => ({ port: p, targetPort: p })),
                selector: this.deployment.spec.template.metadata.labels,
                // Minikube does not implement services of type `LoadBalancer`; require the user to specify if we're
                // running on minikube, and if so, create only services of type ClusterIP.
                type: args.allocateIpAddress ? (args.isMinikube ? "ClusterIP" : "LoadBalancer") : undefined,
            },
        }, { parent: this });

        if (args.metrics) {
            const metricsLabels = { ...labels, metrics: "true" };
            this.metricsService = new k8s.core.v1.Service(`${name}-metrics`, {
                metadata: { name: `${name}-metrics`, labels: metricsLabels },
                spec: {
                    selector: labels,
                    ports: [{ name: "metrics", port: args.metrics.port, targetPort: "metrics" }],
                },
            }, { parent: this });

            this.serviceMonitor = new k8s.apiextensions.CustomResource(name, {
                apiVersion: "monitoring.coreos.com/v1",
                kind: "ServiceMonitor",
                metadata: { name, labels },
                spec: {
                    selector: { matchLabels: metricsLabels },
                    endpoints: [{ port: "metrics", interval: args.metrics.interval || "15s" }],
                },
            }, { parent: this, dependsOn: opts?.dependsOn });
        }

        if (args.allocateIpAddress) {
            this.ipAddress = args.isMinikube ?
                this.service.spec.clusterIP :
                this.service.status.loadBalancer.ingress[0].apply(i => i.ip || i.hostname);
        }
    }
}

export interface MetricsExporterArgs {
    image: string;
    port: number;
    args?: string[];
    interval?: string;
}

export interface ServiceDeploymentArgs {
    image: string;
    resources?: k8stypes.core.v1.ResourceRequirements;
    replicas?: number;
    ports?: number[];
    allocateIpAddress?: boolean;
    isMinikube?: boolean;
    metrics?: MetricsExporterArgs;
}
