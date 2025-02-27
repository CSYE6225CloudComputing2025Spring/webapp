packer {
  required_plugins {
    amazon = {
      version = ">= 1.0.0, < 2.0.0"
      source  = "github.com/hashicorp/amazon"
    }

    google = {
      version = ">= 1.0.0, < 2.0.0"
      source  = "github.com/hashicorp/google"
    }
  }
}

variable "aws-region" {
    type = string
    default = "us-east-1"
}

variable "source_ami" {
    type = string
    default = "ami-04b4f1a9cf54c11d0"  # Ubuntu 24.04 LTS us-east-1 
}

variable "ssh_username" {
    type = string
    default = "ubuntu"
}

variable "subnet_id" {
    type = string
    default = "subnet-02d16bca0e034eea1"
}




variable "gcp_project_id" {
    type    = string
    default = "dev-gcp-github-actions"  
}

variable "gcp_zone" {
    type    = string
    default = "us-central1-a"
}

variable "mysql_root_password" {
  type        = string
  description = "The root password for MySQL"
}

variable "db_name" {
  type        = string
  description = "The name of the database to create"
  default     = "cloud_computing"
}

source "amazon-ebs" "my-aws-ami" {
  region        = "${var.aws_region}"
  ami_name      = "csye6225_spring_2025_app_${formatdate("YYYY_MM_DD", timestamp())}"
  ami_description = "AMI for CSYE 6225 Spring 2025"

  instance_type = "t2.small"
  source_ami = "${var.source_ami}"
  ssh_username = "${var.ssh_username}"
  subnet_id = "${var.subnet_id}"

  launch_block_device_mappings {
    delete_on_termination = true
    device_name = "dev/sda1"
    volume_size = 8
    volume_type = "gp2"
  }

  tags = {
    "Name" = "CSYE6225-App-Image"
  }
}

source "googlecompute" "my-gcp-image" {
  project_id  = "${var.gcp_project_id}"
  zone        = "${var.gcp_zone}"
  image_name  = "csye6225_spring_2025_app_${formatdate("YYYY_MM_DD", timestamp())}"
  image_family = "custom-ubuntu-application-image"
  source_image = "ubuntu-os-cloud/ubuntu-2404-lts"
  ssh_username = "${var.ssh_username}"

  disk_size = 10
  disk_type = "pd-standard"
  machine_type = "n1-standard-1"

  tags = {
    "Name" = "CSYE6225-App-Image"
  }
}

build {
  sources = [
    "source.amazon-ebs.my-aws-ami",
    "source.googlecompute.my-gcp-image",
  ]

  provisioner "file" {
    source      = "../webapp.zip"  
    destination = "/opt/csye6225/webapp.zip"  
  }

  provisioner "shell" {
    environment_vars = [
      "DEBIAN_FRONTEND=noninteractive",
      "MYSQL_ROOT_PASSWORD=${env("MYSQL_ROOT_PASSWORD")}",
      "CHECKPOINT_DISABLE=1"
    ]
    inline = [
      "sudo apt-get update && sudo apt-get upgrade -y",

      "sudo apt-get install -y mysql-server unzip nodejs npm",

      "sudo systemctl start mysql",
      "sudo systemctl enable mysql",

      "sudo sed -i 's/^bind-address.*/bind-address = 127.0.0.1/' /etc/mysql/mysql.conf.d/mysqld.cnf",
      "sudo systemctl restart mysql",

      "sudo mysql -e \"ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${var.mysql_root_password}'; FLUSH PRIVILEGES;\"",

      "sudo mysql -u root -p'${var.mysql_root_password}' -e \"CREATE DATABASE IF NOT EXISTS ${var.db_name} DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;\"",

      "sudo groupadd csye6225",
      "sudo useradd -m -g csye6225 -s /usr/sbin/nologin csye6225",

      "sudo mkdir -p /opt/csye6225",
      "sudo unzip /opt/csye6225/webapp.zip -d /opt/csye6225",

      "sudo chown -R csye6225:csye6225 /opt/csye6225",
      "sudo chmod -R 750 /opt/csye6225",

      "echo '[Unit]\nDescription=Node.js Application\nAfter=network.target\n\n[Service]\nExecStart=/usr/bin/node /opt/csye6225/index.js\nWorkingDirectory=/opt/csye6225\nRestart=always\nUser=csye6225\nGroup=csye6225\n\n[Install]\nWantedBy=multi-user.target' | sudo tee /etc/systemd/system/webapp.service",

      "sudo systemctl daemon-reload",
      "sudo systemctl enable webapp.service"
    ]
  }
}
