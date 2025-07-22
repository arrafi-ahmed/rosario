import $axios from "@/plugins/axios";
import {ifAdmin} from "@/others/util";

export const namespaced = true;

export const state = {
  admins: [],
};

export const mutations = {
  setAdmins(state, payload) {
    state.admins = payload;
  },
  addAdmin(state, payload) {
    state.admins.unshift(payload);
  },
  editAdmin(state, payload) {
    const foundIndex = state.admins.findIndex((item) => item.id == payload.id);
    if (foundIndex !== -1) state.admins[foundIndex] = payload;
  },
  deleteAppUser(state, payload) {
    const foundIndex = state.admins.findIndex((item) => item.id == payload);
    if (foundIndex !== -1) state.admins.splice(foundIndex, 1)
  },
};

export const actions = {
  saveAppUser({commit}, request) {
    const commitName = `${request.id ? 'edit' : 'add'}${request.type === 'admin' ? 'Admin' : ''}`;
    const {type, ...rest} = request;
    return new Promise((resolve, reject) => {
      $axios
        .post("/appUser/save", rest)
        .then((response) => {
          const {password, ...rest} = response.data?.payload;
          commit(commitName, {
            ...rest,
            password: request.password,
          });
          resolve(response);
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  setAdmins({commit}, request) {
    return new Promise((resolve, reject) => {
      $axios
        .get("/appUser/getAppUsers", {
          params: {clubId: request},
        })
        .then((response) => {
          commit("setAdmins", response.data?.payload?.appUsers);
          resolve(response);
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  deleteAppUser({commit}, request) {
    return new Promise((resolve, reject) => {
      $axios
        .get("/appUser/deleteAppUser", {
          params: {id: request},
        })
        .then((response) => {
          commit("deleteAppUser", request);
          resolve(response);
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
};

export const getters = {};
