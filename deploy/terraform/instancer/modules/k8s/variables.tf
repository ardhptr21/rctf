variable "ctf_name" {
    type = string
}

variable "instancer_host" {
    type = string
}

# Request logs: rCTF's public URL and its `instanceRequestLogs.token`. Vector
# isn't installed while the token is empty.
variable "rctf_url" {
    type = string
    default = ""
}

variable "instance_request_logs_token" {
    type = string
    default = ""
    sensitive = true
}
