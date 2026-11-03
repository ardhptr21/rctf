# Sends Traefik's HTTP access log to rCTF, which stores each request on the
# instance it reached (Admin -> Instances). Only installed with a token.
locals {
    request_logs_enabled = var.instance_request_logs_token != ""
}

resource "kubernetes_namespace_v1" "vector" {
    count = local.request_logs_enabled ? 1 : 0

    metadata {
        name = "vector"
    }
}

resource "kubernetes_secret_v1" "vector" {
    count = local.request_logs_enabled ? 1 : 0

    metadata {
        name = "vector-rctf"
        namespace = kubernetes_namespace_v1.vector[0].metadata[0].name
    }

    data = {
        RCTF_URL = var.rctf_url
        RCTF_INSTANCE_REQUEST_LOGS_TOKEN = var.instance_request_logs_token
    }
}

resource "helm_release" "vector" {
    count = local.request_logs_enabled ? 1 : 0

    name = "vector"
    repository = "https://helm.vector.dev"
    chart = "vector"
    namespace = kubernetes_namespace_v1.vector[0].metadata[0].name

    values = [
        yamlencode({
            # one pod per node, reading the logs of the Traefik pods on it
            role = "Agent"

            envFrom = [
                {
                    secretRef = {
                        name = kubernetes_secret_v1.vector[0].metadata[0].name
                    }
                }
            ]

            customConfig = {
                data_dir = "/vector-data-dir"

                sources = {
                    traefik = {
                        type = "kubernetes_logs"
                        extra_namespace_label_selector = "kubernetes.io/metadata.name=${helm_release.traefik.namespace}"
                        extra_label_selector = "app.kubernetes.io/name=traefik"
                    }
                }

                transforms = {
                    access_log = {
                        type = "remap"
                        inputs = ["traefik"]
                        # Traefik's own log lines share the stream; keep only
                        # access log entries
                        drop_on_abort = true
                        source = <<-VRL
                            parsed, err = parse_json(.message)
                            if err != null || !is_object(parsed) || !exists(parsed.RequestHost) {
                              abort
                            }
                            . = parsed
                        VRL
                    }
                }

                sinks = {
                    rctf = {
                        type = "http"
                        inputs = ["access_log"]
                        uri = "$${RCTF_URL}/api/v2/integrations/instance-requests"
                        method = "post"
                        auth = {
                            strategy = "bearer"
                            token = "$${RCTF_INSTANCE_REQUEST_LOGS_TOKEN}"
                        }
                        # each batch is sent as {"entries": [...]}
                        encoding = {
                            codec = "json"
                        }
                        framing = {
                            method = "character_delimited"
                            character_delimited = {
                                delimiter = ","
                            }
                        }
                        payload_prefix = "{\"entries\":"
                        payload_suffix = "}"
                        batch = {
                            max_events = 500
                            timeout_secs = 5
                        }
                        request = {
                            retry_attempts = 10
                        }
                    }
                }
            }
        })
    ]
}
