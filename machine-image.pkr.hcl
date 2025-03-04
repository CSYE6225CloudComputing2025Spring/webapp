packer {
  required_plugins {
    amazon = {
      version = ">= 1.0.0, < 2.0.0"
      source  = "github.com/hashicorp/amazon"
    }
    googlecompute = {
      version = ">= 1.0.0, < 2.0.0"
      source  = "github.com/hashicorp/googlecompute"
    }
  }
}

variable "cloud" {
  type        = string
  default = ""
}

variable "aws_region" { //used
  type    = string
  default = "us-east-1"
}

variable "source_ami" { //used
  type    = string
  default = "ami-04b4f1a9cf54c11d0" # Ubuntu 24.04 LTS us-east-1 
}

variable "ssh_username" {
  type    = string
  default = "ubuntu"
}

variable "subnet_id" { //used
  type    = string
  default = "subnet-02d16bca0e034eea1"
}

source "amazon-ebs" "my-aws-ami" {
  region   = var.aws_region
  ami_name = "csye6225_spring_2025_app_${formatdate("YYYY_MM_DD", timestamp())}"

  ami_description = "AMI for CSYE 6225 Spring 2025"
  instance_type   = "t2.small"
  source_ami      = var.source_ami
  ssh_username    = var.ssh_username
  subnet_id       = var.subnet_id

  launch_block_device_mappings {
    delete_on_termination = true
    device_name           = "/dev/sda1"
    volume_size           = 25
    volume_type           = "gp2"
  }

  tags = {
    "Name" = "CSYE6225-App-Image"
  }
}



variable "gcp_project_id" {
  type    = string
  default = "dev-gcp-github-actions"
}

variable "gcp_zone" {
  type    = string
  default = "us-central1-a"
}

variable "MYSQL_DB_NAME" {
  type    = string
  default = ""
}

variable "MYSQL_ROOT_PASSWORD" {
  type    = string
  default = ""
}

source "googlecompute" "my-gcp-image" {
  project_id   = "${var.gcp_project_id}"
  zone         = "${var.gcp_zone}"
  image_name   = "csye6225-spring-2025-app-${formatdate("YYYY-MM-DD", timestamp())}"
  image_family = "custom-ubuntu-application-image"

  source_image = "ubuntu-os-cloud/ubuntu-2404-lts"
  ssh_username = "${var.ssh_username}"

  disk_size    = 10
  disk_type    = "pd-standard"
  machine_type = "n1-standard-1"

  tags = ["CSYE6225-App-Image"]
}

build {
  name = "my-first-build"
  sources = [
    "source.amazon-ebs.my-aws-ami",
    "source.googlecompute.my-gcp-image",
  ]

  provisioner "file" {
    source      = "./index.js"
    destination = "/tmp/index.js"
  }

  provisioner "file" {
    source      = "./package.json"
    destination = "/tmp/package.json"
  }

  provisioner "file" {
    source      = "./tests"
    destination = "/tmp/tests"
  }

  provisioner "shell" {
    environment_vars = [
      "DEBIAN_FRONTEND=noninteractive",
      "MYSQL_DB_NAME=${var.MYSQL_DB_NAME}",
      "MYSQL_ROOT_PASSWORD=${var.MYSQL_ROOT_PASSWORD}"
    ]
    inline = [
      "sudo apt-get update && sudo apt-get upgrade -y",
      "sudo apt-get install -y mysql-server nodejs npm",

      "sudo systemctl start mysql",
      "sudo systemctl enable mysql",
      "sudo sed -i 's/^bind-address.*/bind-address = 127.0.0.1/' /etc/mysql/mysql.conf.d/mysqld.cnf",
      "sudo systemctl restart mysql",
      "sudo mysql -e \"ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${var.MYSQL_ROOT_PASSWORD}'; FLUSH PRIVILEGES;\"",
      "sudo mysql -u root --password='${var.MYSQL_ROOT_PASSWORD}' -e \"CREATE DATABASE IF NOT EXISTS ${var.MYSQL_DB_NAME} DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;\"",

      "sudo groupadd csye6225",
      "sudo useradd -m -g csye6225 -s /usr/sbin/nologin csye6225",
      "sudo mkdir -p /opt/csye6225",

      "sudo mv /tmp/index.js /opt/csye6225/index.js",
      "sudo mv /tmp/package.json /opt/csye6225/package.json",
      "sudo mv /tmp/tests /opt/csye6225/tests",
      "sudo chown -R csye6225:csye6225 /opt/csye6225",
      "sudo chmod -R 750 /opt/csye6225",

      "echo '[Service]' | sudo tee /etc/systemd/system/csye6225.service",
      "echo 'ExecStart=/usr/bin/node /opt/csye6225/index.js' | sudo tee -a /etc/systemd/system/csye6225.service",
      "echo 'WorkingDirectory=/opt/csye6225' | sudo tee -a /etc/systemd/system/csye6225.service",
      "echo 'Restart=always' | sudo tee -a /etc/systemd/system/csye6225.service",
      "echo 'User=csye6225' | sudo tee -a /etc/systemd/system/csye6225.service",
      "echo 'Group=csye6225' | sudo tee -a /etc/systemd/system/csye6225.service",
      "echo 'EnvironmentFile=/opt/csye6225/.env' | sudo tee -a /etc/systemd/system/csye6225.service",
      "echo '[Install]' | sudo tee -a /etc/systemd/system/csye6225.service",
      "echo 'WantedBy=multi-user.target' | sudo tee -a /etc/systemd/system/csye6225.service",

      "sudo systemctl daemon-reload",
      "sudo systemctl enable csye6225.service",
      "sudo systemctl start csye6225.service"
    ]
  }

}
