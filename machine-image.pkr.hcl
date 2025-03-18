packer {
  required_plugins {
    amazon = {
      version = ">= 1.0.0, < 2.0.0"
      source  = "github.com/hashicorp/amazon"
    }
  }
}

variable "cloud" {
  type    = string
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

variable "MYSQL_DB_NAME" {
  type    = string
  default = ""
}

variable "MYSQL_ROOT_PASSWORD" {
  type    = string
  default = ""
}

build {
  name = "my-first-build"
  sources = [
    "source.amazon-ebs.my-aws-ami",

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

      "sudo bash -c 'echo DB_HOST=localhost > /opt/csye6225/.env'",
      "sudo bash -c 'echo DB_PORT=3306 >> /opt/csye6225/.env'",
      "sudo bash -c 'echo DB_USER=root >> /opt/csye6225/.env'",
      "sudo bash -c 'echo DB_PASSWORD=1234Aa >> /opt/csye6225/.env'",
      "sudo bash -c 'echo DB_NAME=cloud_computing >> /opt/csye6225/.env'",
      "sudo bash -c 'echo DIALECT=mysql >> /opt/csye6225/.env'",
      "sudo bash -c 'echo PORT=8080 >> /opt/csye6225/.env'",
      "sudo bash -c 'echo NODE_ENV=development >> /opt/csye6225/.env'",

      "sudo chown -R csye6225:csye6225 /opt/csye6225",
      "sudo chmod -R 750 /opt/csye6225",
      "sudo chmod 600 /opt/csye6225/.env",
      "sudo bash -c 'cd /opt/csye6225 && npm install dotenv --unsafe-perm=true --allow-root'",


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
      "sudo systemctl enable csye6225",
      "sudo systemctl start csye6225",
      "sudo systemctl status csye6225 --no-pager",
      "sudo journalctl -u csye6225 --no-pager | tail -n 50"

    ]
  }

}
