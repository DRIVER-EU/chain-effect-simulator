
# Chain-effects simulator

A simulation tool that calculates the effects of a flooding. Both the direct effects (e.g. a power station floods) as well as chain effects (e.g. a hospital fails because of a blackout caused by the flood) are taken into account.

### Running the simulation
Build the simulation using the command:
```
npm install
npm run build
```

Test the simulation using the command:
```
npm run test
```

Run the simulation using the command:

```
npm run start
```
It will listen to the test-bed time, and start a flood when the time starts running.


To run the simulation in batch mode, use the command:
```
npm run start-batch
```
This will immediately start publishing the entire flood, without listening to the time-service.

