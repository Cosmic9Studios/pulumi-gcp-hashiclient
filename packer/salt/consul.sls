/etc/consul.d/client.json:
  file.managed:
    - source:
      - 'salt://files/client.json'

# Download 
curl -o consul.zip https://releases.hashicorp.com/consul/1.4.4/consul_1.4.4_linux_amd64.zip: 
  cmd.run:
    - creates: /usr/bin/consul

# Place in bin directory
unzip consul.zip:
  cmd.run: 
    - creates: /usr/bin/consul

sudo mv consul /usr/bin:
  cmd.run: 
    - creates: /usr/bin/consul

rm -rf consul.zip:
  cmd.run: 
    - creates: /usr/bin/consul

sudo mkdir -p /scripts: 
  cmd.run: 
    - creates: /scripts

echo "consul agent -config-dir=/etc/consul.d -ui" > /scripts/consul.sh:
  cmd.run: 
    - creates: /scripts/consul.sh