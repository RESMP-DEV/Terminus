#!/bin/bash

# Create a new user account named 'sandboxuser' with a home directory
sudo useradd -m sandboxuser

# Install necessary tools
sudo apt-get update
sudo apt-get install -y git python3 python3-pip curl wget build-essential