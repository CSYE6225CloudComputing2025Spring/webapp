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


variable "AWS_ACCESS_KEY" {
  type        = string
  description = "AWS access key for authentication"
}

variable "AWS_SECRET_KEY" {
  type        = string
  description = "AWS secret key for authentication"
}

variable "aws-region" {
  type    = string
  default = "us-east-1"
}

variable "source_ami" {
  type    = string
  default = "ami-04b4f1a9cf54c11d0" # Ubuntu 24.04 LTS us-east-1 
}

variable "ssh_username" {
  type    = string
  default = "ubuntu"
}

variable "subnet_id" {
  type    = string
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
  region          = var.aws_region
  ami_name        = "csye6225_spring_2025_app_${formatdate("YYYY_MM_DD", timestamp())}"
  ami_description = "AMI for CSYE 6225 Spring 2025"

  access_key = var.AWS_ACCESS_KEY
  secret_key = var.AWS_SECRET_KEY

  instance_type = "t2.small"
  source_ami    = var.source_ami
  ssh_username  = var.ssh_username
  subnet_id     = var.subnet_id

  launch_block_device_mappings {
    delete_on_termination = true
    device_name           = "dev/sda1"
    volume_size           = 8
    volume_type           = "gp2"
  }

  tags = {
    "Name" = "CSYE6225-App-Image"
  }okokokoko
}


source "googlecompute" "my-gcp-image" {
  project_id   = "${var.gcp_project_id}"
  zone         = "${var.gcp_zone}"
  image_name   = "csye6225_spring_2025_app_${formatdate("YYYY_MM_DD", timestamp())}"
  image_family = "custom-ubuntu-application-image"
  source_image = "ubuntu-os-cloud/ubuntu-2404-lts"
  ssh_username = "${var.ssh_username}"

  disk_size    = 10
  disk_type    = "pd-standard"
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
    source      = "../index.js"
    destination = "/tmp/index.js"
  }

  provisioner "file" {
    source      = "../package.json"
    destination = "/tmp/package.json"
  }

  provisioner "shell" {
    environment_vars = [
      "DEBIAN_FRONTEND=noninteractive",
      "MYSQL_ROOT_PASSWORD=${env("MYSQL_ROOT_PASSWORD")}",
      "CHECKPOINT_DISABLE=1"
    ]
    inline = [
      "sudo apt-get update && sudo apt-get upgrade -y",
      "sudo apt-get install -y mysql-server nodejs npm",

      "sudo systemctl start mysql",
      "sudo systemctl enable mysql",
      "sudo sed -i 's/^bind-address.*/bind-address = 127.0.0.1/' /etc/mysql/mysql.conf.d/mysqld.cnf",
      "sudo systemctl restart mysql",
      "sudo mysql -e \"ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${var.mysql_root_password}'; FLUSH PRIVILEGES;\"",
      "sudo mysql -u root -p'${var.mysql_root_password}' -e \"CREATE DATABASE IF NOT EXISTS ${var.db_name} DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;\"",

      "sudo groupadd csye6225",
      "sudo useradd -m -g csye6225 -s /usr/sbin/nologin csye6225",
      "sudo mkdir -p /opt/csye6225",

      "sudo mv /tmp/index.js /opt/csye6225/index.js",
      "sudo mv /tmp/package.json /opt/csye6225/package.json",
      "sudo chown -R csye6225:csye6225 /opt/csye6225",
      "sudo chmod -R 750 /opt/csye6225",

      "cd /opt/csye6225 && npm install",

      "echo '[Unit]' | sudo tee /etc/systemd/system/webapp.service",
      "echo 'Description=Node.js Application' | sudo tee -a /etc/systemd/system/webapp.service",
      "echo 'After=network.target' | sudo tee -a /etc/systemd/system/webapp.service",
      "echo '' | sudo tee -a /etc/systemd/system/webapp.service",
      "echo '[Service]' | sudo tee -a /etc/systemd/system/webapp.service",
      "echo 'ExecStart=/usr/bin/node /opt/csye6225/index.js' | sudo tee -a /etc/systemd/system/webapp.service",
      "echo 'WorkingDirectory=/opt/csye6225' | sudo tee -a /etc/systemd/system/webapp.service",
      "echo 'Restart=always' | sudo tee -a /etc/systemd/system/webapp.service",
      "echo 'User=csye6225' | sudo tee -a /etc/systemd/system/webapp.service",
      "echo 'Group=csye6225' | sudo tee -a /etc/systemd/system/webapp.service",
      "echo '' | sudo tee -a /etc/systemd/system/webapp.service",
      "echo '[Install]' | sudo tee -a /etc/systemd/system/webapp.service",
      "echo 'WantedBy=multi-user.target' | sudo tee -a /etc/systemd/system/webapp.service",

      "sudo systemctl daemon-reload",
      "sudo systemctl enable webapp.service",
      "sudo systemctl start webapp.service"
    ]
  }
}
