// Copyright 2016-2025, Pulumi Corporation.  All rights reserved.

import * as k8sjs from "./k8sjs";
import { MonitoringStack } from "./monitoring";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();

const monitoring = new MonitoringStack("monitoring");

const redisLeader = new k8sjs.ServiceDeployment("redis-leader", {
    image: "redis:6.0.5",
    ports: [6379],
});

const redisReplica = new k8sjs.ServiceDeployment("redis-replica", {
    image: "pulumi/guestbook-redis-replica",
    ports: [6379],
});

const frontend = new k8sjs.ServiceDeployment("frontend", {
    replicas: 3,
    image: "pulumi/guestbook-php-redis",
    ports: [80],
    allocateIpAddress: true,
    isMinikube: config.getBoolean("isMinikube"),
});

export const frontendIp = frontend.ipAddress;
export const grafanaUrl = monitoring.grafanaUrl;
export const grafanaAdminUser = monitoring.grafanaAdminUser;
export const grafanaAdminPassword = monitoring.grafanaAdminPassword;
