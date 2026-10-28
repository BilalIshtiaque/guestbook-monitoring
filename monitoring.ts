import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";

export class MonitoringStack extends pulumi.ComponentResource {
    public readonly namespace: pulumi.Output<string>;
    public readonly grafanaUrl: pulumi.Output<string>;
    public readonly grafanaAdminUser: pulumi.Output<string>;
    public readonly grafanaAdminPassword: pulumi.Output<string>;

    constructor(name: string, args: MonitoringStackArgs = {}, opts?: pulumi.ComponentResourceOptions) {
        super("k8sjs:monitoring:MonitoringStack", name, {}, opts);

        const grafanaPort = args.grafanaPort ?? 3000;
        const grafanaAdminUser = "admin";

        const namespace = new k8s.core.v1.Namespace(name, {
            metadata: { name: args.namespace ?? "monitoring" },
        }, { parent: this });

        const grafanaPassword = new random.RandomPassword(`${name}-grafana-admin`, {
            length: 20,
            special: false,
        }, { parent: this });

        const release = new k8s.helm.v3.Release(name, {
            name: name,
            chart: "kube-prometheus-stack",
            version: args.chartVersion ?? "92.14.1",
            repositoryOpts: { repo: "https://prometheus-community.github.io/helm-charts" },
            namespace: namespace.metadata.name,
            values: {
                grafana: {
                    adminUser: grafanaAdminUser,
                    adminPassword: grafanaPassword.result,
                    service: { type: "LoadBalancer", port: grafanaPort },
                },
                prometheus: {
                    prometheusSpec: {
                        serviceMonitorSelectorNilUsesHelmValues: false,
                        podMonitorSelectorNilUsesHelmValues: false,
                        ruleSelectorNilUsesHelmValues: false,
                    },
                },
                "prometheus-node-exporter": {
                    hostRootFsMount: { enabled: false },
                },
                kubeEtcd: { enabled: false },
                kubeScheduler: { enabled: false },
                kubeControllerManager: { enabled: false },
                kubeProxy: { enabled: false },
            },
        }, { parent: this });

        const grafanaService = k8s.core.v1.Service.get(
            `${name}-grafana`,
            pulumi.interpolate`${release.status.namespace}/${release.status.name}-grafana`,
            { parent: this, dependsOn: release },
        );

        this.namespace = namespace.metadata.name;
        this.grafanaUrl = grafanaService.status.loadBalancer.ingress.apply(ingress => {
            const host = ingress?.[0]?.hostname || ingress?.[0]?.ip || "localhost";
            return `http://${host}:${grafanaPort}`;
        });
        this.grafanaAdminUser = pulumi.output(grafanaAdminUser);
        this.grafanaAdminPassword = pulumi.secret(grafanaPassword.result);

        this.registerOutputs({
            grafanaUrl: this.grafanaUrl,
            grafanaAdminUser: this.grafanaAdminUser,
            grafanaAdminPassword: this.grafanaAdminPassword,
        });
    }
}

export interface MonitoringStackArgs {
    namespace?: string;
    chartVersion?: string;
    grafanaPort?: number;
}
